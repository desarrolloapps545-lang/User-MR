// supabase/functions/manage-credits/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Helper functions
function getLocalTimeAsUTC() {
    const d = new Date();
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()));
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, payload } = await req.json()

    // --- ACTION: GET CLIENT STATUS FOR CREDIT ---
    if (action === 'getClientStatus') {
        const { client } = payload;

        if (!client || !client.cedula) {
            throw new Error("Datos del cliente incompletos.");
        }

        // 1. Check if client is closed
        if (client.closed === true) {
            return new Response(JSON.stringify({ success: true, isClosed: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // 2. Get debtor history
        const { data: debtors, error: debtorsError } = await supabaseAdmin
            .from('debtors')
            .select('*')
            .eq('cedula', client.cedula);
        
        if (debtorsError) throw debtorsError;

        let blocked = false;
        let isRepreste = false;
        let totalDebt = 0;
        const hasHistory = debtors.length > 0;

        debtors.forEach(d => {
            const bal = d.balance || 0;
            if (bal > 0) totalDebt += bal;

            let term = Array.isArray(d.payment_term) ? d.payment_term[0] : d.payment_term;
            term = (term || '').toUpperCase();

            if ((term.includes('DIARIO') && bal > 30000) || (term.includes('SEMANAL') && bal > 60000)) {
                blocked = true;
            }
            if (bal === 0) {
                isRepreste = true;
            }
        });

        let isExtra = false;
        let extraTerm = '';

        if (blocked) {
            const { data: extras } = await supabaseAdmin
                .from('extras')
                .select('*')
                .eq('cedula', client.cedula)
                .eq('valid', true);
            
            if (extras && extras.length > 0) {
                blocked = false;
                isExtra = true;
                const extraData = extras[0];
                extraTerm = Array.isArray(extraData.payment_term) ? extraData.payment_term[0] : extraData.payment_term;
            }
        }

        if (blocked) {
            return new Response(JSON.stringify({ success: true, isBlocked: true, totalDebt }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }

        // Return full status
        return new Response(JSON.stringify({
            success: true,
            isClosed: false,
            isBlocked: false,
            isRepreste,
            isExtra,
            extraTerm,
            hasHistory,
            clientData: client // Return original client data for form filling
        }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // --- ACTION: REGISTER CREDIT ---
    if (action === 'registerCredit') {
        const { creditData, originalCedula } = payload;
        const {
            name, cedula, phone, address, municipality, asesor_name,
            sale_date, payment_term, credit_type, sale_value, interests,
            number_of_payments, valor_cuota, loan_day
        } = creditData;

        // Basic validation
        if (!name || !cedula || !asesor_name || !sale_value || !number_of_payments) {
            throw new Error("Faltan datos obligatorios para registrar el crédito.");
        }

        // Massive update logic for REPRESTE
        if (credit_type === 'Represte' && originalCedula) {
            const updates = { cedula, name, phone, address, municipality, asesor_name };

            await supabaseAdmin.from('clients').update(updates).eq('cedula', originalCedula);
            await supabaseAdmin.from('debtors').update(updates).eq('cedula', originalCedula);
            
            const paymentUpdates = { cedula: String(cedula), phone, address, municipality, debtor_name: name };
            await supabaseAdmin.from('payments').update(paymentUpdates).eq('cedula', String(originalCedula));
        }

        // Calcular debtor_number
        const { data: maxData, error: maxError } = await supabaseAdmin
            .from('debtors')
            .select('debtor_number')
            .order('debtor_number', { ascending: false })
            .limit(1);

        if (maxError) throw maxError;
        const lastDebtorNumber = maxData && maxData.length > 0 ? maxData[0].debtor_number : 0;
        const nextDebtorNumber = (Number(lastDebtorNumber) || 0) + 1;

        // Insert new debtor record
        const totalCreditValue = sale_value + interests;
        const newDebtor = {
            ...creditData,
            debtor_number: nextDebtorNumber,
            total_credit_value: totalCreditValue,
            balance: totalCreditValue,
            remaining_payments: number_of_payments,
            created_at: getLocalTimeAsUTC()
        };

        const { error: insertError } = await supabaseAdmin.from('debtors').insert([newDebtor]);

        if (insertError) throw insertError;

        return new Response(JSON.stringify({ success: true, message: "CRÉDITO CREADO EXITOSAMENTE" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: false, message: "Acción no válida" }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 });

  } catch (error) {
    return new Response(JSON.stringify({ success: false, message: error.message }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 });
  }
})