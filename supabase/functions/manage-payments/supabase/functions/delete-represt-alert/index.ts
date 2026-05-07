// supabase/functions/delete-represt-alert/index.ts

import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from "https://esm.sh/@supabase/supabase-js@2"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
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

    const { cedula } = await req.json()

    if (!cedula) {
      throw new Error("La cédula es obligatoria para eliminar la alerta.")
    }

    // ELIMINAR TODOS LOS REGISTROS POR CÉDULA (Sin filtrar por debtor_number)
    const { error } = await supabaseAdmin
      .from('alerts_represt')
      .delete()
      .eq('cedula', String(cedula))

    if (error) throw error

    return new Response(
      JSON.stringify({ success: true, message: "Solicitud de represte eliminada correctamente." }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    )

  } catch (error) {
    return new Response(
      JSON.stringify({ success: false, message: error.message }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
