// supabase/functions/manage-payments/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Función auxiliar para capitalizar (Misma lógica que en tu frontend)
function capitalizeInput(text: string): string {
    if (!text) return '';
    const str = String(text).trim().toLowerCase();
    // Palabras a mantener en minúscula (excepto la primera)
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
    // Ajustar a hora Colombia (UTC-5)
    const now = new Date();
    const offset = -5;
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

    // --- ACTION: CREATE REPREST ALERT ---
    if (action === 'createReprestAlert') {
        const { alertData } = payload;
        const { error } = await supabaseAdmin
            .from('alerts_represt')
            .insert([alertData]);
        
        if (error) throw error;
        
        return new Response(
            JSON.stringify({ success: true, message: "Solicitud de represte creada." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    // --- ACTION: CREATE PAYMENT ALERT ---
    if (action === 'createPaymentAlert') {
        const { alertData } = payload;
        const { error } = await supabaseAdmin
            .from('payments_alerts')
            .insert([alertData]);

        if (error) throw error;

        return new Response(
            JSON.stringify({ success: true, message: "Solicitud de pago adicional creada." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    // --- ACTION: DELETE PAYMENT ALERT ---
    if (action === 'deletePaymentAlert') {
        const { id } = payload;
        const { error } = await supabaseAdmin
            .from('payments_alerts')
            .delete()
            .eq('id', id);
        
        if (error) throw error;

        return new Response(
            JSON.stringify({ success: true, message: "Alerta de pago eliminada." }),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    if (action === 'register') {
        const {
            selectedDebtor,
            paymentAmount,
            closeCard,
            paymentMethod,
            paymentDate,
            currentUserRole,
            currentUserName,
            approvedReprestAlertId,
            approvedSecondPaymentAlertId
        } = payload;

        // --- Validaciones del lado del servidor ---
        if (!selectedDebtor || paymentAmount === undefined || paymentAmount === null) {
             return new Response(
                JSON.stringify({ success: false, message: "Datos de pago incompletos o malformados." }),
                { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
            )
        }

        if (paymentAmount <= 0) {
            throw new Error("El valor del abono debe ser mayor a cero.");
        }

        if (paymentAmount > selectedDebtor.balance) {
            throw new Error("El valor del abono no puede ser mayor a la deuda actual.");
        }

        // Determinar quién registra el pago
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
        let paymentUserName = isPrivileged ? (selectedDebtor.asesor_name || currentUserName) : currentUserName;
        if (!paymentUserName) {
            throw new Error("No se pudo identificar al usuario que registra el pago.");
        }

        // Ajustar a hora Colombia (UTC-5) para el día de la semana usando Intl para mayor precisión
        const now = new Date();
        const formatter = new Intl.DateTimeFormat('es-CO', { timeZone: 'America/Bogota', weekday: 'long' });
        let dayName = formatter.format(now);
        // Capitalizar primera letra (ej: "lunes" -> "Lunes")
        const paymentDay = dayName.charAt(0).toUpperCase() + dayName.slice(1).toLowerCase();

        // Sanitizar IDs de alertas para evitar errores en el RPC
        const safeReprestId = (approvedReprestAlertId && approvedReprestAlertId !== "") ? approvedReprestAlertId : null;
        const safeSecondPayId = (approvedSecondPaymentAlertId && approvedSecondPaymentAlertId !== "") ? approvedSecondPaymentAlertId : null;

        // Obtener secuencia global de pagos
        const { data: maxData, error: maxError } = await supabaseAdmin
            .from('payments')
            .select('payment_number')
            .order('payment_number', { ascending: false })
            .limit(1);

        if (maxError) throw new Error("Error al obtener secuencia de pagos.");
        const lastPaymentNumber = maxData && maxData.length > 0 ? maxData[0].payment_number : 0;
        const nextPaymentNumber = (Number(lastPaymentNumber) || 0) + 1;

        // Construir el objeto JSONB para la tabla de pagos
        const paymentData = {
            user_name: paymentUserName,
            payment_amount: Number(paymentAmount ?? 0) || 0,
            payment_number: nextPaymentNumber,
            debtor_number: Number(selectedDebtor.debtor_number ?? 0) || 0, // Guarda el numero del credito
            payment_date: paymentDate,
            payment_method: paymentMethod,
            payment_day: paymentDay,
            municipality: typeof selectedDebtor.municipality === 'string' ? selectedDebtor.municipality : '',
            created_at: getLocalTimeAsUTC(),
            address: capitalizeInput(String(selectedDebtor.address ?? '')),
            cedula: String(selectedDebtor.cedula ?? ''),
            debtor_name: capitalizeInput(String(selectedDebtor.name ?? '')),
            phone: Number(selectedDebtor.phone ?? 0) || 0,
            valor_cuota: Number(selectedDebtor.valor_cuota ?? 0) || 0
        };

        // Llamar a la función de PostgreSQL
        const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('register_payment_and_update', {
            p_payment_data: paymentData,
            p_debtor_cedula: String(selectedDebtor.cedula ?? ''),
            p_debtor_number: Number(selectedDebtor.debtor_number ?? 0) || 0,
            p_payment_amount: Number(paymentAmount ?? 0) || 0,
            p_close_card: !!closeCard, // Asegurar booleano
            p_approved_represt_alert_id: safeReprestId,
            p_approved_second_payment_alert_id: safeSecondPayId
        });

        if (rpcError) throw rpcError;

        // --- FIX: Asegurar que debtor_number se guarde en la tabla payments ---
        // Si el RPC no actualizó la columna debtor_number, lo forzamos aquí.
        if (nextPaymentNumber) {
             const { error: updateError } = await supabaseAdmin
                .from('payments')
                .update({ debtor_number: Number(selectedDebtor.debtor_number ?? 0) || 0 })
                .eq('payment_number', nextPaymentNumber);
             
             if (updateError) console.error("Error updating debtor_number fallback:", updateError);
        }

        const result = rpcData;
        if (!result.success) {
            throw new Error(result.message);
        }

        return new Response(
            JSON.stringify(result),
            { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
        )
    }

    return new Response(
      JSON.stringify({ success: false, message: "Acción no válida" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
    )

  } catch (error) {
    console.error("Error in manage-payments:", error);
    return new Response(
      JSON.stringify({ success: false, message: error.message || "Error interno del servidor" }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})