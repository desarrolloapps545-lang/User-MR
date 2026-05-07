// supabase/functions/manage-reports/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función auxiliar para capitalizar (Consistencia con manage-payments)
function capitalizeInput(text: string): string {
    if (!text) return '';
    const str = String(text).trim().toLowerCase();
    const exceptions = ['de', 'a', 'el', 'la', 'los', 'las', 'y', 'en', 'con'];
    return str.split(' ').map((word, index) => {
        if (word.length > 0) {
            if (index > 0 && exceptions.includes(word)) {
                return word;
            }
            return word.charAt(0).toUpperCase() + word.slice(1);
        }
        return '';
    }).join(' ');
}

function getLocalTimeAsUTC() {
    const now = new Date();
    const offset = -5; // Colombia UTC-5
    const d = new Date(now.getTime() + offset * 60 * 60 * 1000);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds())).toISOString();
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

    // --- ACTION: REGISTER CLIENT ---
    if (action === 'register') {
        const { name, cedula, address, phone, paymentTerm, municipality, targetAsesorName } = payload;

        if (!name || !cedula || !municipality || !targetAsesorName) {
             return new Response(
                JSON.stringify({ success: false, message: "Faltan datos obligatorios para el registro." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Verificar si el cliente ya existe
        const { data: existingClient, error: checkError } = await supabaseAdmin
            .from('clients')
            .select('cedula')
            .eq('cedula', cedula)
            .maybeSingle();

        if (checkError) throw checkError;

        if (existingClient) {
            return new Response(
                JSON.stringify({ success: false, message: "El cliente con esta cédula ya existe en el sistema." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
            )
        }

        // Insertar nuevo cliente
        const { error: insertError } = await supabaseAdmin
            .from('clients')
            .insert([{
                name: capitalizeInput(name),
                cedula,
                address: capitalizeInput(address),
                phone,
                payment_term: [paymentTerm],
                municipality,
                asesor_name: targetAsesorName,
                created_at: getLocalTimeAsUTC()
            }]);

        if (insertError) throw insertError;

        return new Response(
            JSON.stringify({ success: true, message: "CLIENTE REGISTRADO CON EXITO" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    // --- ACTION: REGISTER DAILY REPORT ---
    if (action === 'registerDailyReport') {
        const { reportData } = payload;

        // 1. Validations
        if (!reportData || !reportData.user_name || !reportData.report_date) {
             return new Response(
                JSON.stringify({ success: false, message: "Faltan datos obligatorios para el reporte." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 2. Check for existing report
        const { data: existingReport, error: checkError } = await supabaseAdmin
            .from('reports')
            .select('report_number')
            .eq('user_name', reportData.user_name)
            .eq('report_date', reportData.report_date)
            .limit(1);

        if (checkError) throw checkError;

        if (existingReport && existingReport.length > 0) {
            return new Response(
                JSON.stringify({ success: false, message: `Ya existe un reporte diario para ${reportData.user_name} en la fecha ${reportData.report_date}.` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
            )
        }

        // 3. Get next report number
        const { count: reportCount, error: countError } = await supabaseAdmin
            .from('reports')
            .select('*', { count: 'exact', head: true });

        if (countError) throw countError;
        const nextReportNumber = (reportCount || 0) + 1;

        // 4. Insert Report
        const { error: insertError } = await supabaseAdmin
            .from('reports')
            .insert([{ ...reportData, report_number: nextReportNumber }]);

        if (insertError) throw insertError;

        return new Response(
            JSON.stringify({ success: true, message: "REPORTE GUARDADO CON EXITO" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    // --- ACTION: REGISTER WEEKLY REPORT ---
    if (action === 'registerWeeklyReport') {
        const { reportData } = payload;

        // 1. Validations
        if (!reportData || !reportData.user_name || !reportData.report_date) {
             return new Response(
                JSON.stringify({ success: false, message: "Faltan datos obligatorios para el reporte." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // 2. Check for existing report
        const { data: existingReport, error: checkError } = await supabaseAdmin
            .from('wreports')
            .select('report_number')
            .eq('user_name', reportData.user_name)
            .eq('report_date', reportData.report_date)
            .limit(1);

        if (checkError) throw checkError;

        if (existingReport && existingReport.length > 0) {
            return new Response(
                JSON.stringify({ success: false, message: `Ya existe un reporte semanal para ${reportData.user_name} en la fecha ${reportData.report_date}.` }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 409 }
            )
        }

        // 3. Get next report number
        const { count: reportCount, error: countError } = await supabaseAdmin
            .from('wreports')
            .select('*', { count: 'exact', head: true });

        if (countError) throw countError;
        const nextReportNumber = (reportCount || 0) + 1;

        // 4. Insert Report
        const { error: insertError } = await supabaseAdmin
            .from('wreports')
            .insert([{ ...reportData, report_number: nextReportNumber }]);

        if (insertError) throw insertError;

        return new Response(
            JSON.stringify({ success: true, message: "REPORTE SEMANAL GUARDADO CON EXITO" }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    return new Response(
      JSON.stringify({ success: false, message: "Acción no válida" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Error interno del servidor" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})