// supabase/functions/get-debtors/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper para paginación automática
async function fetchAll(query) {
    const pageSize = 1000;
    let allData = [];
    let page = 0;
    let more = true;

    while (more) {
        const { data, error } = await query.range(page * pageSize, (page + 1) * pageSize - 1);
        if (error) throw error;
        
        if (data && data.length > 0) {
            allData = allData.concat(data);
            more = data.length === pageSize;
            page++;
        } else {
            more = false;
        }
    }
    return allData;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { 
        municipality, 
        paymentType, 
        asesorFilter, 
        searchName, 
        currentUserRole, 
        currentUserName 
    } = await req.json();

    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    // --- 1. Cargar Deudores ---
    let debtorsQuery = supabaseAdmin
        .from('debtors')
        .select('*')
        .gt('balance', 0)
        .eq('municipality', municipality);

    if (paymentType) {
        debtorsQuery = debtorsQuery.contains('payment_term', [paymentType]);
    }

    if (!isPrivileged) {
        debtorsQuery = debtorsQuery.eq('asesor_name', currentUserName);
    } else if (asesorFilter) {
        debtorsQuery = debtorsQuery.eq('asesor_name', asesorFilter);
    }

    if (searchName) {
        debtorsQuery = debtorsQuery.ilike('name', `%${searchName}%`);
    }
    
    const debtors = await fetchAll(debtorsQuery);
    
    // Ajuste de Zona Horaria Colombia (UTC-5) para cálculos de recaudación
    const now = new Date(new Date().getTime() - (5 * 60 * 60 * 1000));
    const todayStrISO = now.toISOString().split('T')[0];

    if (debtors.length === 0) {
        return new Response(JSON.stringify({ debtors: [], allPayments: [], allAlerts: [], totalCollection: 0 }), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200,
        });
    }

    // --- 2. Cargar Pagos y Alertas relacionados ---
    const dayOfWeek = now.getDay(); 
    const diff = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
    const mondayThisWeek = new Date(now);
    mondayThisWeek.setDate(diff);
    mondayThisWeek.setHours(0,0,0,0);
    
    // Ampliamos el rango de búsqueda de pagos para cubrir desfases de carga
    const filterDateISO = mondayThisWeek.toISOString();

    let paymentsQuery = supabaseAdmin
        .from('payments')
        .select('cedula, payment_date, debtor_number')
        .eq('municipality', municipality)
        .gte('created_at', filterDateISO);

    if (!isPrivileged) {
        paymentsQuery = paymentsQuery.eq('user_name', currentUserName);
    } else if (asesorFilter) {
        paymentsQuery = paymentsQuery.eq('user_name', asesorFilter);
    }

    const allPayments = await fetchAll(paymentsQuery);

    const allCedulas = [...new Set(debtors.map(d => d.cedula))];
    let allAlerts = [];
    const pageSize = 1000;
    for (let i = 0; i < allCedulas.length; i += pageSize) {
        const chunk = allCedulas.slice(i, i + pageSize);
        const { data, error } = await supabaseAdmin
            .from('payments_alerts')
            .select('*')
            .in('cedula', chunk);
        if (error) console.error("Error loading alerts chunk:", error);
        if (data) allAlerts = allAlerts.concat(data);
    }

    // --- 3. Calcular Cobro Realizado ---
    let totalCollection = 0;
    if (paymentType) {
        const selectedTypeUpper = String(paymentType).toUpperCase();
        let payQuery;

        payQuery = supabaseAdmin
            .from('payments')
            .select('payment_amount, debtor_number, created_at')
            .eq('municipality', municipality);

        if (selectedTypeUpper === 'DIARIO') {
            // Colombia Day Start/End en UTC
            const dayStr = now.toISOString().split('T')[0];
            const startStr = dayStr + 'T05:00:00.000Z';
            const end = new Date(now.getTime() + (24 * 60 * 60 * 1000));
            const endStr = end.toISOString().split('T')[0] + 'T04:59:59.999Z';
            
            payQuery = payQuery.gte('created_at', startStr).lte('created_at', endStr);
        } else { // SEMANAL
            // Colombia Week Start/End en UTC
            const startStr = mondayThisWeek.toISOString().split('T')[0] + 'T05:00:00.000Z';
            const nextMon = new Date(mondayThisWeek.getTime() + (7 * 24 * 60 * 60 * 1000));
            const endStr = nextMon.toISOString().split('T')[0] + 'T04:59:59.999Z';
            
            payQuery = payQuery.gte('created_at', startStr).lte('created_at', endStr);
        }

        if (!isPrivileged) { payQuery = payQuery.eq('user_name', currentUserName); } 
        else if (asesorFilter) { payQuery = payQuery.eq('user_name', asesorFilter); }
        
        const collectionPayments = await fetchAll(payQuery);
        
        if (collectionPayments.length > 0) {
            const debtorNumbers = [...new Set(collectionPayments.map(p => p.debtor_number).filter(n => n != null))];
            let debtorTerms = [];
            for (let i = 0; i < debtorNumbers.length; i += pageSize) {
                const chunk = debtorNumbers.slice(i, i + pageSize);
                const { data, error } = await supabaseAdmin.from('debtors').select('debtor_number, payment_term').in('debtor_number', chunk);
                if (error) console.error("Error loading terms chunk for collection:", error);
                if (data) debtorTerms = debtorTerms.concat(data);
            }
            
            const termMap = {};
            debtorTerms.forEach(d => { termMap[d.debtor_number] = (Array.isArray(d.payment_term) ? d.payment_term[0] : d.payment_term || '').toUpperCase(); });
            collectionPayments.forEach(p => { 
                // SEGMENTACION ROBUSTA: Comparación de igualdad estricta para evitar mezclas entre Diario y Semanal
                if (termMap[p.debtor_number] && termMap[p.debtor_number] === selectedTypeUpper) { totalCollection += (p.payment_amount || 0); } 
            });
        }
    }

    // --- 4. Enviar respuesta ---
    return new Response(
      JSON.stringify({ debtors, allPayments, allAlerts, totalCollection }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    console.error("Error in get-debtors:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Error interno del servidor" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})