// supabase/functions/manage-reports/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, GET, OPTIONS, PUT, DELETE',
}

serve(async (req) => {
  // Manejo de preflight request (CORS)
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    const { action, payload } = await req.json()

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

        // Validación Extra: Integridad de los datos numéricos
        if (reportData.final_base === undefined || reportData.credits_report === undefined) {
            return new Response(
                JSON.stringify({ success: false, message: "El reporte contiene valores numéricos inconsistentes." }),
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

        // Validación Extra: Segmentación Robusta - Solo Domingos para Cierres Semanales
        // Usamos T12:00:00 para evitar que el desfase de zona horaria cambie el día al instanciar
        const reportDateObj = new Date(reportData.report_date + 'T12:00:00');
        if (reportDateObj.getDay() !== 0) {
            return new Response(
                JSON.stringify({ success: false, message: "ERROR DE SEGMENTACION: Los reportes semanales solo pueden registrarse con fecha de domingo." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        // Validación de coherencia: No permitir valores nulos en campos críticos
        if (reportData.credits_report < 0 || reportData.payments_report < 0) {
            return new Response(
                JSON.stringify({ success: false, message: "Los totales del reporte no pueden ser negativos." }),
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