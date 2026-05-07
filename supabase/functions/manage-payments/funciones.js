// Supabase configuration
const supabaseUrl = 'https://fiahwrkuouceyncxoukj.supabase.co';
const supabaseKey = 'sb_publishable_9lTA1sPLY9iSTASjrCgE6g_Cr1qQ_Re';

// Initialize Supabase client
window.supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

// Variables globales de usuario
let currentUserName = '';
let currentUserCedula = '';
let currentUserMunicipality = [];
let currentUserRole = '';
let selectedClientOriginalData = null;
let selectedDebtorForPayment = null;
let debtorsRefreshInterval = null;
let currentLinkNameRegistration = '';
let cachedDepartments = null; // Cache para departamentos y municipios
let currentApprovedAlert = null; // Para manejar el segundo pago aprobado
let currentApprovedReprestAlert = null; // Para manejar el pago de represte aprobado

// Spinner helpers
function showSpinnerAndBlock() {
    document.getElementById('loading-overlay').classList.remove('hidden');
}

function hideSpinnerAndUnblock() {
    document.getElementById('loading-overlay').classList.add('hidden');
}

function showSuccessWithDelay(message, callback) {
    // Assumes spinner is already showing
    setTimeout(() => {
        hideSpinnerAndUnblock();
        alert(message);
        if (callback) callback();
    }, 3000);
}

// Bloqueo de navegación del navegador (Gestos/Botón Atrás)
history.pushState(null, null, location.href);
window.onpopstate = function () {
    history.go(1);
};

async function signInWithSupabase(email, password) {
    try {
        const { data, error } = await window.supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            console.error("Error signing in:", error);
            return { success: false, message: `Error al iniciar sesión: ${error.message}` };
        } else {
            console.log("Successfully signed in:", data);
            return { success: true, message: "", showHome:true };
        }
    } catch (error) {
        console.error("Unexpected error:", error);
        return { success: false, message: `Error inesperado: ${error.message}` };
    }
}

// Función para cargar perfil de usuario (Remapeo de columnas)
async function loadUserProfile() {
    try {
        // No ocultamos el loading aquí, esperamos a terminar la carga
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        
        if (user) {
            // CONSULTA A SUPABASE: Tabla 'users'
            // Remapeo: assignedMunicipality (Firebase) -> assigned_municipality (Supabase)
            const { data, error } = await window.supabaseClient
                .from('users')
                .select('name, cedula, assigned_municipality, role') 
                .eq('id', user.id)
                .single();

            if (error) {
                console.error("Error cargando perfil:", error);
                document.getElementById('home-welcome-msg').textContent = "Bienvenido";
            } else if (data) {
                // Asignar a variables globales
                currentUserName = data.name || '';
                currentUserCedula = data.cedula || '';
                currentUserMunicipality = data.assigned_municipality || [];
                currentUserRole = data.role ? data.role.toLowerCase() : '';

                // Actualizar UI
                let welcomeMsg = `Bienvenido, ${currentUserName}`;
                
                if (currentUserRole === 'desarrollador') {
                    welcomeMsg = `Bienvenido Desarrollador, ${currentUserName}`;
                } else if (currentUserRole.includes('administrador')) {
                    welcomeMsg = `Bienvenido Administrador, ${currentUserName}`;
                }
                document.getElementById('home-welcome-msg').textContent = welcomeMsg;

                // Mostrar botones especiales para Admin/Dev
                if (['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole)) {
                    document.getElementById('btn-inversiones').classList.remove('hidden');
                    document.getElementById('btn-database').classList.remove('hidden');
                } else {
                    document.getElementById('btn-inversiones').classList.add('hidden');
                    document.getElementById('btn-database').classList.add('hidden');
                }
            }
        }
    } catch (e) {
        console.error("Excepción cargando perfil:", e);
    } finally {
        // Ocultar pantalla de carga inicial una vez finalizado todo el proceso (éxito o error)
        const loadingScreen = document.getElementById('initial-loading-screen');
        if (loadingScreen) loadingScreen.style.display = 'none';
    }
}

// Función Cerrar Sesión
async function logout() {
    if (confirm("¿Desea cerrar sesión?")) {
        const { error } = await window.supabaseClient.auth.signOut();
        if (error) {
            alert("Error al cerrar sesión: " + error.message);
        } else {
            window.location.reload(); // Recargar para limpiar estado
        }
    }
}

window.logout = logout;

document.addEventListener('DOMContentLoaded', function() {
    // Start with the class that centers the login form
    document.body.classList.add('logged-out');

    // Timeout de seguridad: Ocultar pantalla de carga después de 3 segundos máximo
    setTimeout(() => {
        const loadingScreen = document.getElementById('initial-loading-screen');
        if (loadingScreen && loadingScreen.style.display !== 'none') {
            loadingScreen.style.display = 'none';
        }
    }, 3000);

function showHomeScreen() {
    if (debtorsRefreshInterval) clearInterval(debtorsRefreshInterval);
    document.querySelector('.container').style.display = 'none'; // Hide login container
    document.getElementById('home').classList.remove('hidden'); // Show home screen
    document.getElementById('registrar-cliente-section').classList.add('hidden'); // Hide register screen
    document.getElementById('credito-section').classList.add('hidden'); // Hide credit screen
    document.getElementById('ver-deudores-section').classList.add('hidden'); // Hide debtors screen
    document.getElementById('registrar-pago-section').classList.add('hidden'); // Hide payment screen
    document.getElementById('gastos-diarios-section').classList.add('hidden');
    document.getElementById('gastos-semanales-section').classList.add('hidden');
    document.getElementById('reporte-diario-section').classList.add('hidden');
    document.getElementById('reporte-semanal-section').classList.add('hidden');
    document.getElementById('reportes-type-modal').classList.add('hidden');
    document.getElementById('search-client-modal').classList.add('hidden'); // Hide search modal
}
window.showHomeScreen = showHomeScreen;

// Listener de Estado de Autenticación (Persistencia)
window.supabaseClient.auth.onAuthStateChange((event, session) => {
    const loadingScreen = document.getElementById('initial-loading-screen');
    
    if (event === 'SIGNED_IN' || event === 'INITIAL_SESSION') {
        if (session) {
            document.body.classList.remove('logged-out');
            const loginContainer = document.querySelector('.container');
            
            // Cargar perfil siempre al iniciar sesión o recuperar sesión
            // loadUserProfile se encargará de ocultar el loadingScreen al finalizar
            loadUserProfile().then(() => {
                 // Solo redirigir al home si estamos en la pantalla de login (container visible)
                 // O si es la sesión inicial (recarga de página)
                if ((loginContainer && loginContainer.style.display !== 'none') || event === 'INITIAL_SESSION') {
                    showHomeScreen();
                }
            });
        } else {
            // Si no hay sesión (ej. token expirado), ocultar carga y mostrar login
            if (loadingScreen) loadingScreen.style.display = 'none';
        }
    } else if (event === 'SIGNED_OUT') {
        document.body.classList.add('logged-out');
        document.querySelector('.container').style.display = 'block';
        document.getElementById('home').classList.add('hidden');
        // Asegurar que el loading se oculte al cerrar sesión
        if (loadingScreen) loadingScreen.style.display = 'none';
    }
});

// Función para mostrar pantalla de registro
function showRegisterClientScreen() {
    if (debtorsRefreshInterval) clearInterval(debtorsRefreshInterval);
    document.getElementById('home').classList.add('hidden');
    document.getElementById('registrar-cliente-section').classList.remove('hidden');
    
    const munSelect = document.getElementById('municipality-select');
    const deptSelect = document.getElementById('department-select');
    const asesorSelect = document.getElementById('asesor-select');
    const adminFieldDept = document.getElementById('admin-field-dept');
    const adminFieldAsesor = document.getElementById('admin-field-asesor');

    // Limpiar selects
    munSelect.innerHTML = '<option value="" disabled selected>Seleccione un municipio</option>';
    deptSelect.innerHTML = '<option value="" disabled selected>Seleccione un departamento</option>';
    asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
    
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    if (isPrivileged) {
        // --- MODO ADMIN/DEV ---
        adminFieldDept.classList.remove('hidden');
        adminFieldAsesor.classList.remove('hidden');

        // Definir listener de cambio de departamento ANTES de cargar datos
        deptSelect.onchange = function() {
            munSelect.innerHTML = '<option value="" disabled selected>Seleccione un municipio</option>';
            asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
            
            const selectedOption = deptSelect.options[deptSelect.selectedIndex];
            if (!selectedOption) return;

            const munis = JSON.parse(selectedOption.dataset.munis || '[]');
            
            munis.forEach(mun => {
                const option = document.createElement('option');
                option.value = mun;
                option.textContent = mun;
                munSelect.appendChild(option);
            });
        };

        // Función para poblar departamentos (reutilizable y cacheable)
        const populateDepartments = (data) => {
            deptSelect.innerHTML = '<option value="" disabled selected>Seleccione un departamento</option>';
            data.forEach(dept => {
                const option = document.createElement('option');
                option.value = dept.id; // El ID es el nombre del departamento
                option.textContent = dept.id;
                // Guardamos los municipios en el elemento para no volver a consultar
                option.dataset.munis = JSON.stringify(dept.municipalities || []);
                deptSelect.appendChild(option);
            });
            
            // Si solo hay un departamento, seleccionarlo automáticamente
            if (data.length === 1) {
                deptSelect.value = data[0].id;
                deptSelect.dispatchEvent(new Event('change'));
            }
        };

        // 1. Cargar Departamentos (Con Cache para evitar retrasos)
        if (cachedDepartments) {
            populateDepartments(cachedDepartments);
        } else {
            window.supabaseClient
                .from('municipalities')
                .select('id, municipalities')
                .then(({ data, error }) => {
                    if (data) {
                        cachedDepartments = data;
                        populateDepartments(data);
                    } else if (error) {
                        console.error("Error cargando departamentos:", error);
                    }
                });
        }

        // 3. Listener Cambio Municipio -> Cargar Asesores
        munSelect.onchange = async function() {
            asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
            const selectedMun = munSelect.value;

            // Buscar usuarios que tengan este municipio asignado
            const { data: users } = await window.supabaseClient
                .from('users')
                .select('name, assigned_municipality, role')
                .contains('assigned_municipality', [selectedMun]); // Filtro de array en Supabase
            
            if (users) {
                users.forEach(user => {
                    // Filtrar roles administrativos para que no aparezcan en la lista
                    const userRole = user.role ? user.role.toLowerCase() : '';
                    if (['administrador', 'administrador maestro', 'desarrollador'].includes(userRole)) {
                        return;
                    }

                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.name;
                    asesorSelect.appendChild(option);
                });
            }
        };

    } else {
        // --- MODO USUARIO NORMAL ---
        adminFieldDept.classList.add('hidden');
        adminFieldAsesor.classList.add('hidden');
        
        if (currentUserMunicipality && Array.isArray(currentUserMunicipality)) {
            currentUserMunicipality.forEach(mun => {
                const option = document.createElement('option');
                option.value = mun;
                option.textContent = mun;
                munSelect.appendChild(option);
            });
        }
    }
}
window.showRegisterClientScreen = showRegisterClientScreen;

// Función para Registrar Cliente
async function registerClient() {
    // 1. Obtener valores de entrada (la normalización se hará en el servidor)
    const name = document.getElementById('client-name').value.trim();
    const cedula = document.getElementById('client-cedula').value.trim();
    const address = document.getElementById('client-address').value.trim();
    const phoneStr = document.getElementById('client-phone').value.trim();
    const paymentTerm = document.getElementById('payment-select').value;
    const municipality = document.getElementById('municipality-select').value;
    
    // 2. Validaciones básicas de UI
    if (!name || !cedula || !address || !phoneStr || !paymentTerm || !municipality) {
        alert("Por favor complete todos los campos");
        return;
    }

    const phone = Number(phoneStr);
    if (isNaN(phone) || phone === 0) {
        alert("Por favor ingrese un número de teléfono válido");
        return;
    }

    // 3. Determinar Asesor y Validar Permisos
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    let targetAsesorName = currentUserName; // Por defecto el usuario logueado

    if (isPrivileged) {
        const dept = document.getElementById('department-select').value;
        const asesor = document.getElementById('asesor-select').value;
        
        if (!dept) {
            alert("Como administrador, debe seleccionar un departamento.");
            return;
        }
        if (!asesor) {
            alert("Como administrador, debe seleccionar un asesor.");
            return;
        }
        targetAsesorName = asesor; // El asesor seleccionado será el "dueño" del cliente
    } else {
        // Validación para usuario normal
        if (!targetAsesorName) {
            await loadUserProfile(); // Intentar recargar perfil si falta
            targetAsesorName = currentUserName;
        }
    }

    if (!targetAsesorName) {
        alert("Error crítico: No se ha podido identificar al asesor. Por favor, cierre sesión y vuelva a intentarlo.");
        return;
    }

    try {
        showSpinnerAndBlock();
        // 4. INVOCAR EDGE FUNCTION (Lógica de negocio centralizada)
        const { data, error } = await window.supabaseClient.functions.invoke('manage-clients', {
            body: {
                action: 'register',
                payload: {
                    name,
                    cedula,
                    address,
                    phone,
                    paymentTerm,
                    municipality,
                    targetAsesorName
                }
            }
        });

        if (error) {
            // Si hay un error de red o un status no-2xx, el objeto 'error' se poblará.
            // Intentamos leer el cuerpo del error para un mensaje más específico.
            hideSpinnerAndUnblock();
            if (error.context && typeof error.context.json === 'function') {
                const errorData = await error.context.json();
                throw new Error(errorData.message || 'La función devolvió un error sin mensaje.');
            }
            throw error; // Si no se puede leer el JSON, lanzar el error original.
        }

        // Verificar respuesta de la lógica de negocio desde la Edge Function
        if (!data.success) {
            // Si la función devuelve un error de negocio, lo mostramos
            hideSpinnerAndUnblock();
            throw new Error(data.message);
        }

        // Si todo fue bien, mostrar el mensaje de éxito de la función con retraso
        showSuccessWithDelay(data.message, () => {
            // Limpiar formulario
            document.getElementById('client-name').value = '';
            document.getElementById('client-cedula').value = '';
            document.getElementById('client-address').value = '';
            document.getElementById('client-phone').value = '';
            document.getElementById('payment-select').value = '';
            document.getElementById('municipality-select').value = '';
            
            // Si es admin, limpiar selects para evitar confusiones
            if (isPrivileged) {
                document.getElementById('department-select').value = '';
                document.getElementById('asesor-select').innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
                document.getElementById('municipality-select').innerHTML = '<option value="" disabled selected>Seleccione un municipio</option>';
            }

            showHomeScreen();
        });

    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error registrando cliente:", error);
        alert("Error al registrar cliente: " + error.message);
    }
}
window.registerClient = registerClient;

// --- FUNCIONES DE CRÉDITO ---

// Utilidades de Formato
function formatCurrency(value) {
    if (value === undefined || value === null || value === '') return '';
    const strValue = value.toString();
    const isNegative = strValue.includes('-') || (typeof value === 'number' && value < 0);
    const numberPart = strValue.replace(/[^\d]/g, '');
    return (isNegative ? '- ' : '') + '$ ' + numberPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

function parseCurrency(value) {
    if (value === undefined || value === null || value === '') return 0;
    const strValue = value.toString();
    const isNegative = strValue.includes('-');
    const number = parseInt(strValue.replace(/[^\d]/g, '')) || 0;
    return isNegative ? -number : number;
}

function getFormattedDate() {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const year = now.getFullYear();
    return `${day}-${month}-${year}`;
}

/**
 * Crea una fecha que representa la hora local actual, pero la guarda como si fuera UTC.
 * Esto soluciona el problema de que los registros creados después de las 7 PM (hora de Colombia)
 * aparezcan con la fecha del día siguiente en la base de datos (debido a la conversión a UTC).
 * Ejemplo: 26/10 8:00 PM (UTC-5) se guardará como 26/10 20:00:00Z en lugar de 27/10 01:00:00Z.
 * ADVERTENCIA: Esto corrige la FECHA para consultas simples, pero la HORA exacta del evento se vuelve incorrecta.
 */
function getLocalTimeAsUTC() {
    const d = new Date();
    // Crea una nueva fecha utilizando los componentes de la hora local, pero interpretados como UTC.
    return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()));
}

// Obtiene la fecha local en formato YYYY-MM-DD para inputs de tipo date
// Soluciona el problema de desfase de zona horaria de toISOString()
function getLocalDateISO() {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Obtiene la fecha del domingo de la semana actual en formato YYYY-MM-DD
function getCurrentSundayISO() {
    const now = new Date();
    const day = now.getDay(); // 0 = Sunday
    const diff = day === 0 ? 0 : (7 - day);
    const sunday = new Date(now);
    sunday.setDate(now.getDate() + diff);
    
    const year = sunday.getFullYear();
    const month = String(sunday.getMonth() + 1).padStart(2, '0');
    const d = String(sunday.getDate()).padStart(2, '0');
    return `${year}-${month}-${d}`;
}

// Combina una fecha seleccionada (YYYY-MM-DD) con la hora actual para created_at
function getCreatedAtFromSelection(dateString) {
    if (!dateString) return getLocalTimeAsUTC();
    const now = new Date();
    const parts = dateString.split('-');
    const year = parseInt(parts[0]);
    const month = parseInt(parts[1]) - 1; // Meses en JS son 0-11
    const day = parseInt(parts[2]);
    // Usamos Date.UTC para mantener la consistencia con la lógica de "LocalTimeAsUTC"
    return new Date(Date.UTC(year, month, day, now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds()));
}

function parsePaymentDate(dateStr) {
    if (!dateStr || typeof dateStr !== 'string') return new Date(0);
    const parts = dateStr.split('-');
    if (parts.length !== 3) return new Date(0);
    return new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
}

// Función global para capitalizar texto (Primera mayúscula, resto minúscula)
// Ejemplo: "JUAN PEREZ" -> "Juan perez" (Según solicitud estricta)
function capitalizeInput(text) {
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

// Mostrar pantalla de crédito
function showCreditScreen() {
    if (debtorsRefreshInterval) clearInterval(debtorsRefreshInterval);
    document.getElementById('home').classList.add('hidden');
    document.getElementById('credito-section').classList.remove('hidden');
    
    // Limpiar campos
    document.getElementById('credit-client').value = '';
    document.getElementById('credit-cedula').value = '';
    document.getElementById('credit-phone').value = '';
    document.getElementById('credit-address').value = '';
    document.getElementById('credit-municipality').value = '';
    document.getElementById('credit-date').value = getFormattedDate();
    document.getElementById('credit-payment-type').value = '';
    document.getElementById('credit-type').value = '';
    document.getElementById('credit-value').value = '';
    document.getElementById('credit-interest').value = '';
    document.getElementById('credit-installments').value = '';
    document.getElementById('credit-installment-value').value = '';
    document.getElementById('total-credit-text').textContent = 'VALOR TOTAL CREDITO: $0';
    document.getElementById('credit-payment-type').classList.remove('hidden');
    document.getElementById('credit-payment-select').classList.add('hidden');

    // Configuración de campos Admin/Dev
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    const deptSelect = document.getElementById('credit-department-select');
    const munSelect = document.getElementById('credit-municipality-select');
    const asesorSelect = document.getElementById('credit-asesor-select');
    const adminFieldDept = document.getElementById('credit-admin-field-dept');
    const adminFieldAsesor = document.getElementById('credit-admin-field-asesor');
    const muniInput = document.getElementById('credit-municipality');

    // Resetear visibilidad y valores
    adminFieldDept.classList.add('hidden');
    munSelect.classList.add('hidden');
    adminFieldAsesor.classList.add('hidden');
    muniInput.classList.remove('hidden');
    
    deptSelect.innerHTML = '<option value="" disabled selected>Seleccione un departamento</option>';
    munSelect.innerHTML = '<option value="" disabled selected>Seleccione un municipio</option>';
    asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';

    if (isPrivileged) {
        adminFieldDept.classList.remove('hidden');
        munSelect.classList.remove('hidden');
        adminFieldAsesor.classList.remove('hidden');
        muniInput.classList.add('hidden');

        // Cargar Departamentos
        window.supabaseClient
            .from('municipalities')
            .select('id, municipalities')
            .then(({ data, error }) => {
                if (data) {
                    data.forEach(dept => {
                        const option = document.createElement('option');
                        option.value = dept.id;
                        option.textContent = dept.id;
                        option.dataset.munis = JSON.stringify(dept.municipalities || []);
                        deptSelect.appendChild(option);
                    });
                }
            });

        // Listeners para cascada
        deptSelect.onchange = function() {
            munSelect.innerHTML = '<option value="" disabled selected>Seleccione un municipio</option>';
            asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
            
            const selectedOption = deptSelect.options[deptSelect.selectedIndex];
            const munis = JSON.parse(selectedOption.dataset.munis || '[]');
            
            munis.forEach(mun => {
                const option = document.createElement('option');
                option.value = mun;
                option.textContent = mun;
                munSelect.appendChild(option);
            });
        };

        munSelect.onchange = async function() {
            asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
            const selectedMun = munSelect.value;

            const { data: users } = await window.supabaseClient
                .from('users')
                .select('name, assigned_municipality, role')
                .contains('assigned_municipality', [selectedMun]);
            
            if (users) {
                users.forEach(user => {
                    const userRole = user.role ? user.role.toLowerCase() : '';
                    if (['administrador', 'administrador maestro', 'desarrollador'].includes(userRole)) return;

                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.name;
                    asesorSelect.appendChild(option);
                });
            }
        };
    }

    // Abrir modal de búsqueda automáticamente
    openSearchModal();
}
window.showCreditScreen = showCreditScreen;

// Lógica del Modal de Búsqueda
function openSearchModal() {
    document.getElementById('search-client-modal').classList.remove('hidden');
    document.getElementById('modal-search-input').value = '';
    document.getElementById('client-list-results').innerHTML = '';
}
window.openSearchModal = openSearchModal;

function closeSearchModal() {
    document.getElementById('search-client-modal').classList.add('hidden');
}
window.closeSearchModal = closeSearchModal;

async function searchClient() {
    const type = document.querySelector('input[name="searchType"]:checked').value;
    const value = document.getElementById('modal-search-input').value.trim();
    const resultsContainer = document.getElementById('client-list-results');
    resultsContainer.innerHTML = 'Buscando...';

    if (!value) {
        resultsContainer.innerHTML = 'Ingrese un valor para buscar.';
        return;
    }

    try {
        let query = window.supabaseClient
            .from('clients')
            .select('*');

        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
        if (!isPrivileged) {
            query = query.eq('asesor_name', currentUserName); // Filtrar por asesor actual solo si no es admin/dev
        }

        if (type === 'cedula') {
            query = query.eq('cedula', value);
        } else {
            query = query.ilike('name', `%${value}%`); // Búsqueda insensible a mayúsculas
        }

        const { data, error } = await query;

        if (error) throw error;

        resultsContainer.innerHTML = '';
        if (data.length === 0) {
            resultsContainer.innerHTML = 'No se encontraron clientes.';
        } else {
            data.forEach(client => {
                const div = document.createElement('div');
                div.className = 'client-option';
                div.textContent = `${client.name} - ${client.cedula}`;
                div.onclick = () => selectClientForCredit(client);
                resultsContainer.appendChild(div);
            });
        }
    } catch (error) {
        console.error("Error buscando cliente:", error);
        resultsContainer.innerHTML = 'Error en la búsqueda.';
    }
}
window.searchClient = searchClient;

async function selectClientForCredit(client) {
    // 1. Validar si el cliente está cerrado
    if (client.closed === true) {
        closeSearchModal();
        document.getElementById('closed-client-modal').classList.remove('hidden');
        return;
    }

    // 2. Consultar historial de deudas
    const { data: debtors, error } = await window.supabaseClient
        .from('debtors')
        .select('*')
        .eq('cedula', client.cedula);

    if (error) {
        console.error("Error checking debtors:", error);
        alert("Error consultando historial");
        return;
    }

    let blocked = false;
    let totalDebt = 0;
    let hasHistory = debtors.length > 0;

    debtors.forEach(d => {
        const bal = d.balance || 0;
        if (bal > 0) totalDebt += bal;

        // Validar Bloqueo (Diario > 30k, Semanal > 60k)
        let term = '';
        if (Array.isArray(d.payment_term)) term = d.payment_term[0];
        else term = d.payment_term;
        term = (term || '').toUpperCase();

        if ((term.includes('DIARIO') && bal > 30000) || (term.includes('SEMANAL') && bal > 60000)) {
            blocked = true;
        }
    });

    let isExtra = false;
    let extraTerm = '';

    if (blocked) {
        // Consultar Extras (Excepciones)
        const { data: extras } = await window.supabaseClient
            .from('extras')
            .select('*')
            .eq('cedula', client.cedula)
            .eq('valid', true);
        
        if (extras && extras.length > 0) {
            blocked = false;
            isExtra = true;
            const extraData = extras[0];
            if (Array.isArray(extraData.payment_term)) extraTerm = extraData.payment_term[0];
            else extraTerm = extraData.payment_term;
            alert("CUPO EXTRA APROBADO");
        }
    }

    if (blocked) {
        closeSearchModal();
        document.getElementById('ineligible-debt-amount').value = formatCurrency(totalDebt);
        document.getElementById('ineligible-client-modal').classList.remove('hidden');
        return;
    }

    // --- Si pasa validaciones, llenar formulario ---
    closeSearchModal();

    selectedClientOriginalData = client; // Guardar datos originales para comparación
    document.getElementById('credit-client').value = client.name;
    document.getElementById('credit-cedula').value = client.cedula;
    document.getElementById('credit-cedula').dataset.original = client.cedula; // Guardar original
    document.getElementById('credit-phone').value = client.phone;
    document.getElementById('credit-address').value = client.address;
    document.getElementById('credit-municipality').value = client.municipality;
    
    // Configurar Tipo de Pago
    let pTerm = '';
    if (isExtra) {
        pTerm = extraTerm;
    } else {
        pTerm = (client.payment_term && client.payment_term.length > 0) ? client.payment_term[0] : '';
    }
    
    // Normalizar a Capitalizado
    const normalizedTerm = capitalizeInput(pTerm);
    document.getElementById('credit-payment-type').value = normalizedTerm;
    document.getElementById('credit-payment-select').value = normalizedTerm || 'Diario';

    // Configurar Tipo de Crédito y Campos Editables
    const typeInput = document.getElementById('credit-type');
    const cedulaInput = document.getElementById('credit-cedula');
    const addressInput = document.getElementById('credit-address');
    const phoneInput = document.getElementById('credit-phone');
    const paymentInput = document.getElementById('credit-payment-type');
    const paymentSelect = document.getElementById('credit-payment-select');
    const clientInput = document.getElementById('credit-client');
    
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    if (!hasHistory) {
        typeInput.value = 'NUEVO';
        cedulaInput.setAttribute('readonly', true);
        addressInput.setAttribute('readonly', true);
        phoneInput.setAttribute('readonly', true);
        paymentInput.classList.remove('hidden');
        paymentSelect.classList.add('hidden');
    } else {
        typeInput.value = 'REPRESTE';
        // Habilitar edición para REPRESTE
        addressInput.removeAttribute('readonly');
        phoneInput.removeAttribute('readonly');
        cedulaInput.removeAttribute('readonly');
        
        // Mostrar Select para cambiar tipo de pago
        paymentInput.classList.add('hidden');
        paymentSelect.classList.remove('hidden');

        // Cédula editable solo una vez
        cedulaInput.addEventListener('blur', function() {
            this.setAttribute('readonly', true);
        }, { once: true });
    }

    // Lógica de permisos de edición y campos Admin
    if (isPrivileged) {
        // Admin: Todo editable
        clientInput.removeAttribute('readonly');
        cedulaInput.removeAttribute('readonly');
        // Remover listener de 'once' si existe (clonando el nodo)
        const newCedulaInput = cedulaInput.cloneNode(true);
        cedulaInput.parentNode.replaceChild(newCedulaInput, cedulaInput);
        newCedulaInput.removeAttribute('readonly'); // Asegurar que sea editable
        
        phoneInput.removeAttribute('readonly');
        addressInput.removeAttribute('readonly');

        // Pre-seleccionar valores en dropdowns Admin
        const deptSelect = document.getElementById('credit-department-select');
        const munSelect = document.getElementById('credit-municipality-select');
        const asesorSelect = document.getElementById('credit-asesor-select');

        // Buscar departamento del municipio del cliente
        const { data: depts } = await window.supabaseClient
            .from('municipalities')
            .select('id, municipalities');
        
        if (depts) {
            const foundDept = depts.find(d => d.municipalities && d.municipalities.includes(client.municipality));
            if (foundDept) {
                deptSelect.value = foundDept.id;
                // Disparar evento change manualmente para cargar municipios
                deptSelect.dispatchEvent(new Event('change'));
                
                // Esperar un momento o setear directamente
                munSelect.value = client.municipality;
                // Disparar evento change para cargar asesores
                // Nota: Como munSelect.onchange es async, necesitamos esperar o llamar la lógica
                // Para simplificar, seteamos el valor y llamamos manualmente a la carga de asesores
                
                // Cargar asesores manualmente para asegurar sincronía
                const { data: users } = await window.supabaseClient
                    .from('users')
                    .select('name, assigned_municipality, role')
                    .contains('assigned_municipality', [client.municipality]);
                
                asesorSelect.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
                if (users) {
                    users.forEach(user => {
                        const userRole = user.role ? user.role.toLowerCase() : '';
                        if (['administrador', 'administrador maestro', 'desarrollador'].includes(userRole)) return;
                        const option = document.createElement('option');
                        option.value = user.name;
                        option.textContent = user.name;
                        asesorSelect.appendChild(option);
                    });
                    asesorSelect.value = client.asesor_name;
                }
            }
        }
    } else {
        // Usuario: Nombre fijo
        clientInput.setAttribute('readonly', true);
    }
}

// Cálculos automáticos
function calculateCreditTotals() {
    const value = parseCurrency(document.getElementById('credit-value').value);
    const interest = parseCurrency(document.getElementById('credit-interest').value);
    const installments = parseInt(document.getElementById('credit-installments').value) || 0;

    const total = value + interest;
    document.getElementById('total-credit-text').textContent = 'VALOR TOTAL CREDITO: ' + formatCurrency(total);

    if (installments > 0) {
        const quota = Math.floor(total / installments);
        document.getElementById('credit-installment-value').value = formatCurrency(quota);
    } else {
        document.getElementById('credit-installment-value').value = '';
    }
}

// Listeners para cálculos
['credit-value', 'credit-interest', 'credit-installments'].forEach(id => {
    document.getElementById(id).addEventListener('input', (e) => {
        if(id !== 'credit-installments') e.target.value = formatCurrency(e.target.value);
        calculateCreditTotals();
    });
});

async function registerCredit() {
    showSpinnerAndBlock();
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    
    // --- Recopilación de datos del formulario ---
    const clientName = document.getElementById('credit-client').value.trim();
    const cedula = document.getElementById('credit-cedula').value.trim();
    const saleValue = parseCurrency(document.getElementById('credit-value').value);
    const interest = parseCurrency(document.getElementById('credit-interest').value);
    const installments = parseInt(document.getElementById('credit-installments').value);
    const valorCuota = parseCurrency(document.getElementById('credit-installment-value').value);
    
    const paymentSelect = document.getElementById('credit-payment-select');
    const paymentTerm = capitalizeInput(
        !paymentSelect.classList.contains('hidden') 
            ? paymentSelect.value 
            : document.getElementById('credit-payment-type').value
    );
    
    let municipality;
    let asesorName;

    if (isPrivileged) {
        municipality = document.getElementById('credit-municipality-select').value;
        asesorName = document.getElementById('credit-asesor-select').value;
    } else {
        municipality = document.getElementById('credit-municipality').value;
        asesorName = currentUserName;
    }

    // --- Validaciones Robustas ---
    if (!asesorName && !isPrivileged) {
        await loadUserProfile();
        asesorName = currentUserName;
    }

    if (!clientName || !saleValue || !installments || !valorCuota || !paymentTerm) {
        hideSpinnerAndUnblock();
        alert("Por favor complete todos los campos del crédito.");
        return;
    }
    
    if (!municipality || !asesorName) {
        hideSpinnerAndUnblock();
        alert("Error crítico: Faltan datos del municipio o asesor. Por favor, recargue la página o verifique la selección.");
        return;
    }

    try {
        // --- ACTUALIZACIÓN MASIVA DE DATOS (si es necesario) ---
        if (selectedClientOriginalData) {

        const originalCedula = selectedClientOriginalData.cedula;
        const newPhone = Number(document.getElementById('credit-phone').value);
        const newAddress = document.getElementById('credit-address').value;
        
        const hasChanges = 
            originalCedula != cedula ||
            selectedClientOriginalData.name !== clientName ||
            selectedClientOriginalData.phone != newPhone ||
            selectedClientOriginalData.address !== newAddress ||
            selectedClientOriginalData.municipality !== municipality ||
            selectedClientOriginalData.asesor_name !== asesorName;

        if (hasChanges) {
            await updateClientMassive(originalCedula, {
                cedula: cedula,
                name: clientName,
                phone: newPhone,
                address: newAddress,
                municipality: municipality,
                asesor_name: asesorName
            });
        }
        }

        // --- Creación del registro de crédito ---
        const totalCreditValue = saleValue + interest;
        const days = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
        const loanDay = days[new Date().getDay()];

        // Calcular el número de crédito (debtor_number)
        // CORRECCIÓN: Usar el máximo número existente + 1 en lugar de count() para evitar duplicados si hubo borrados
        const { data: maxData, error: maxError } = await window.supabaseClient
            .from('debtors')
            .select('debtor_number')
            .order('debtor_number', { ascending: false })
            .limit(1);

        if (maxError) {
            throw new Error("Error al calcular el número de crédito.");
        }
        const lastDebtorNumber = maxData && maxData.length > 0 ? maxData[0].debtor_number : 0;
        const nextDebtorNumber = (Number(lastDebtorNumber) || 0) + 1;

        const creditData = {
            name: capitalizeInput(clientName),
            cedula: cedula,
            debtor_number: nextDebtorNumber,
            phone: Number(document.getElementById('credit-phone').value),
            address: capitalizeInput(document.getElementById('credit-address').value),
            municipality: municipality,
            asesor_name: asesorName,
            sale_date: document.getElementById('credit-date').value,
            payment_term: [paymentTerm],
            credit_type: capitalizeInput(document.getElementById('credit-type').value),
            sale_value: saleValue,
            interests: interest,
            total_credit_value: totalCreditValue,
            number_of_payments: installments,
            remaining_payments: installments,
            valor_cuota: valorCuota,
            balance: totalCreditValue,
            loan_day: loanDay,
            created_at: getLocalTimeAsUTC()
        };

        const { error } = await window.supabaseClient.from('debtors').insert([creditData]);

        if (error) {
            hideSpinnerAndUnblock();
            console.error("Error creando crédito:", error);
            alert("Error al crear crédito: " + error.message);
        } else {
            showSuccessWithDelay("CRÉDITO CREADO EXITOSAMENTE", showHomeScreen);
        }
    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error en el proceso de registro de crédito:", error);
        alert("Error: " + error.message);
    }
}
window.registerCredit = registerCredit;

// Función de Actualización Masiva
async function updateClientMassive(originalCedula, newValues) {
    try {
        const updates = {
            cedula: newValues.cedula,
            name: capitalizeInput(newValues.name),
            phone: newValues.phone,
            address: capitalizeInput(newValues.address),
            municipality: newValues.municipality,
            asesor_name: newValues.asesor_name
        };

        const batchPromises = [];

        // 1. Actualizar Clients
        batchPromises.push(window.supabaseClient.from('clients').update(updates).eq('cedula', originalCedula));

        // 2. Actualizar Debtors
        batchPromises.push(window.supabaseClient.from('debtors').update(updates).eq('cedula', originalCedula));

        // 3. Actualizar Payments
        // Payments tiene campos limitados, actualizamos los que coinciden
        const paymentUpdates = {
            cedula: String(newValues.cedula),
            phone: newValues.phone,
            address: capitalizeInput(newValues.address),
            municipality: newValues.municipality,
            debtor_name: capitalizeInput(newValues.name)
        };
        batchPromises.push(window.supabaseClient.from('payments').update(paymentUpdates).eq('cedula', String(originalCedula)));

        await Promise.all(batchPromises);
        console.log("Actualización masiva completada");
    } catch (error) {
        console.error("Error en actualización masiva:", error);
    }
}

// Listeners para Modales de Alerta
document.getElementById('btn-ineligible-ok').addEventListener('click', () => {
    document.getElementById('ineligible-client-modal').classList.add('hidden');
    document.getElementById('search-client-modal').classList.remove('hidden');
    document.getElementById('modal-search-input').value = '';
    document.getElementById('client-list-results').innerHTML = '';
});

document.getElementById('btn-closed-client-ok').addEventListener('click', () => {
    document.getElementById('closed-client-modal').classList.add('hidden');
    document.getElementById('search-client-modal').classList.remove('hidden');
    document.getElementById('modal-search-input').value = '';
    document.getElementById('client-list-results').innerHTML = '';
});

// --- FUNCIONES VER DEUDORES ---

function showDebtorsScreen() {
    if (debtorsRefreshInterval) clearInterval(debtorsRefreshInterval);
    document.getElementById('home').classList.add('hidden');
    document.getElementById('ver-deudores-section').classList.remove('hidden');
    
    const filterMun = document.getElementById('filter-1');
    const filterDept = document.getElementById('filter-dept');
    const filterAsesor = document.getElementById('filter-asesor');

    filterMun.innerHTML = '<option value="" disabled selected>Sin municipio seleccionado</option>';
    filterDept.innerHTML = '<option value="" disabled selected>Seleccione un departamento</option>';
    filterAsesor.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
    
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    
    if (isPrivileged) {
        filterDept.classList.remove('hidden');
        filterAsesor.classList.remove('hidden');

        // Cargar Departamentos
        window.supabaseClient.from('municipalities').select('id, municipalities').then(({ data }) => {
            if (data) {
                data.forEach(dept => {
                    const option = document.createElement('option');
                    option.value = dept.id;
                    option.textContent = dept.id;
                    option.dataset.munis = JSON.stringify(dept.municipalities || []);
                    filterDept.appendChild(option);
                });
            }
        });

        filterDept.onchange = function() {
            filterMun.innerHTML = '<option value="" disabled selected>Seleccione un municipio</option>';
            filterAsesor.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
            const selectedOption = filterDept.options[filterDept.selectedIndex];
            const munis = JSON.parse(selectedOption.dataset.munis || '[]');
            
            munis.forEach(mun => {
                const option = document.createElement('option');
                option.value = mun;
                option.textContent = mun;
                filterMun.appendChild(option);
            });
            document.getElementById('debtors-list-container').innerHTML = '';
            document.getElementById('cobro-realizado').value = '';
            document.getElementById('filter-asesor').value = '';
        };

        filterMun.onchange = async function() {
            loadDebtors();
            // Cargar asesores del municipio seleccionado
            filterAsesor.innerHTML = '<option value="" disabled selected>Seleccione un asesor</option>';
            const selectedMun = filterMun.value;
            const { data: users } = await window.supabaseClient
                .from('users')
                .select('name, assigned_municipality')
                .contains('assigned_municipality', [selectedMun]);
            
            if (users) {
                users.forEach(user => {
                    const option = document.createElement('option');
                    option.value = user.name;
                    option.textContent = user.name;
                    filterAsesor.appendChild(option);
                });
            }
        };
    } else {
        filterDept.classList.add('hidden');
        filterAsesor.classList.add('hidden');

        // Cargar municipios asignados
        if (currentUserMunicipality && Array.isArray(currentUserMunicipality)) {
            currentUserMunicipality.forEach(mun => {
                const option = document.createElement('option');
                option.value = mun;
                option.textContent = mun;
                filterMun.appendChild(option);
            });
        }
    }
    
    // Limpiar lista
    document.getElementById('debtors-list-container').innerHTML = '';
    document.getElementById('cobro-realizado').value = '';

    // Se ha eliminado la autoconsulta para evitar recargas inesperadas.
    // debtorsRefreshInterval = setInterval(() => {
    //     loadDebtors(true);
    // }, 5000);
}
window.showDebtorsScreen = showDebtorsScreen;

async function loadDebtors(silent = false) {
    const municipality = document.getElementById('filter-1').value;
    const paymentType = document.getElementById('filter-2').value;
    const asesorFilter = document.getElementById('filter-asesor').value;
    const department = document.getElementById('filter-dept').value;
    const searchName = document.getElementById('search-debtor').value.toLowerCase();
    const container = document.getElementById('debtors-list-container');
    const cobroInput = document.getElementById('cobro-realizado');
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    
    const previousScroll = container.scrollTop;

    cobroInput.value = '';
    
    if (isPrivileged) {
        if (!department || !municipality || !paymentType) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">Seleccione departamento, municipio y tipo de pago para ver resultados.</div>';
            return;
        }
    } else {
        if (!municipality || !paymentType) {
            container.innerHTML = '<div style="text-align:center; padding:20px;">Seleccione municipio y tipo de pago para ver resultados.</div>';
            return;
        }
    }

    if (!silent) container.innerHTML = '<div style="text-align:center; padding:20px;">Cargando...</div>';
    
    try {
        // --- CAMBIO: Invocar Edge Function para cargar todos los datos ---
        const { data: functionData, error: functionError } = await window.supabaseClient.functions.invoke('manage-debtors', {
            body: {
                municipality,
                paymentType,
                asesorFilter,
                searchName,
                currentUserRole,
                currentUserName
            }
        });

        if (functionError) {
            if (functionError.context && typeof functionError.context.json === 'function') {
                const errorData = await functionError.context.json();
                throw new Error(errorData.message || 'La función devolvió un error sin mensaje.');
            }
            throw functionError;
        }
        
        const { debtors, allPayments, allAlerts, totalCollection } = functionData;
        // ----------------------------------------------------------------

        // Construcción en memoria para actualización sutil
        const tempContainer = document.createElement('div');

        if (!debtors || debtors.length === 0) {
            tempContainer.innerHTML = '<div style="text-align:center; padding:20px;">No hay deudores activos.</div>';
        } else {
            debtors.forEach(data => {
                const row = document.createElement('div');
                row.className = 'table-row';
                row.onclick = () => openDetailsModal(data);
                const statusId = `status-${data.cedula}-${data.debtor_number}`;
                
                row.innerHTML = `
                    <div>${data.name || ''} (${data.debtor_number || 'N/A'})</div>
                    <div id="${statusId}" class="status-cell">...</div>
                    <div>${formatCurrency(Math.round(data.valor_cuota || 0))}</div>
                    <div>${formatCurrency(data.balance)}</div>
                    <div>${data.municipality || ''}</div>
                `;
                tempContainer.appendChild(row);
            });
        }

        // Reemplazo del contenido
        container.innerHTML = '';
        while (tempContainer.firstChild) {
            container.appendChild(tempContainer.firstChild);
        }

        // Verificar estados de pago después de renderizar
        if (debtors && debtors.length > 0) {
            // Calcular inicio de semana para filtrar pagos y optimizar la consulta
            const now = new Date();
            const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
            const dayOfWeek = todayMidnight.getDay(); 
            const diff = todayMidnight.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
            const mondayThisWeek = new Date(todayMidnight);
            mondayThisWeek.setDate(diff);
            mondayThisWeek.setHours(0,0,0,0);

            const latestPayMap = {};
            if (allPayments) {
                allPayments.forEach(p => {
                    const pDate = parsePaymentDate(p.payment_date);
                    // Guardamos la fecha más reciente encontrada para cada deudor
                    if (!latestPayMap[p.debtor_cedula] || pDate > latestPayMap[p.debtor_cedula]) {
                        latestPayMap[p.debtor_cedula] = pDate;
                    }
                });
            }

            // Mapa de conteo de pagos por periodo actual

            const paymentCounts = {}; // key: 'cedula-debtor_number', value: [Date, Date, ...]

            if (allPayments) {
                allPayments.forEach(p => {
                    const pDate = parsePaymentDate(p.payment_date);
                    pDate.setHours(0,0,0,0);
                    
                    // Pre-procesamos agrupando por cedula y numero de credito
                    const key = `${p.cedula}-${p.debtor_number}`;
                    if (!paymentCounts[key]) paymentCounts[key] = [];
                    paymentCounts[key].push(pDate);
                });
            }

            debtors.forEach(data => {
                const statusId = `status-${data.cedula}-${data.debtor_number}`;
                const term = (Array.isArray(data.payment_term) ? data.payment_term[0] : data.payment_term || '').toUpperCase();
                
                // Contar pagos en el periodo actual
                let currentPeriodPayments = 0;
                const key = `${data.cedula}-${data.debtor_number}`;
                const pDates = paymentCounts[key] || [];
                
                pDates.forEach(d => {
                    if (term.includes('DIARIO')) {
                        if (d.getTime() === todayMidnight.getTime()) currentPeriodPayments++;
                    } else if (term.includes('SEMANAL')) {
                        if (d >= mondayThisWeek) currentPeriodPayments++;
                    }
                });

                let iconHtml = '<span class="status-bad"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>'; // X Roja

                if (currentPeriodPayments >= 2) {
                    // Doble Check Verde
                    iconHtml = '<div style="display:flex; gap:2px;"><span class="status-ok"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span class="status-ok"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span></div>';
                } else if (currentPeriodPayments === 1) {
                    // Check Verde normal, PERO verificar alertas
                    iconHtml = '<span class="status-ok"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>';
                    
                    if (allAlerts) {
                        // Buscar alerta para este deudor en el periodo actual
                        const alert = allAlerts.find(a => {
                            if (a.cedula !== data.cedula || a.debtor_number !== data.debtor_number) return false;
                            // Validar fecha de alerta vs periodo actual
                            const aDate = parsePaymentDate(a.payment_date); // Usamos la fecha texto guardada
                            aDate.setHours(0,0,0,0);
                            if (term.includes('DIARIO')) {
                                return aDate.getTime() === todayMidnight.getTime();
                            } else if (term.includes('SEMANAL')) {
                                const sundayThisWeek = new Date(mondayThisWeek);
                                sundayThisWeek.setDate(mondayThisWeek.getDate() + 6);
                                return aDate >= mondayThisWeek && aDate <= sundayThisWeek;
                            }
                            return false; // No es ni diario ni semanal
                        });

                        if (alert) {
                            // Si pay es NULL (pendiente) o TRUE (aprobado pero no pagado aun), mostrar exclamacion naranja
                            if (alert.pay === null || alert.pay === true) {
                                iconHtml = '<span style="color: orange;"><svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg></span>';
                            }
                            // Si es false (rechazado), se queda con el check verde del primer pago
                        }
                    }
                }

                const el = document.getElementById(statusId);
                if (el) {
                    el.innerHTML = iconHtml;
                }
            });
        }

        if (silent) container.scrollTop = previousScroll;

        // --- Mostrar Cobro Realizado (calculado por la Edge Function) ---
        cobroInput.value = formatCurrency(totalCollection);

    } catch (error) {
        console.error("Error cargando deudores:", error);
        container.innerHTML = `<div style="text-align:center; padding:20px; color:red;">${error.message || 'Error al cargar datos.'}</div>`;
    }
}
window.loadDebtors = loadDebtors;

async function checkPaymentStatus(debtorCedula, debtorNumber, elementId, paymentTerm) {
    try {
        const { data: payments } = await window.supabaseClient
            .from('payments')
            .select('payment_date')
            .eq('cedula', debtorCedula)
            .eq('debtor_number', debtorNumber)
            .order('created_at', { ascending: false })
            .limit(1);

        let isOk = false;
        const term = (Array.isArray(paymentTerm) ? paymentTerm[0] : paymentTerm || '').toUpperCase();
        
        // Fecha actual normalizada a medianoche
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        if (payments && payments.length > 0) {
            const lastPay = payments[0];
            let pDateObj = null;

            // Usar SIEMPRE payment_date (formato DD-MM-YYYY)
            if (lastPay.payment_date && typeof lastPay.payment_date === 'string' && lastPay.payment_date.includes('-')) {
                const parts = lastPay.payment_date.split('-');
                if (parts.length === 3) {
                    // new Date(year, monthIndex, day)
                    pDateObj = new Date(parseInt(parts[2]), parseInt(parts[1]) - 1, parseInt(parts[0]));
                }
            }
            
            // Si pDateObj no es una fecha válida (porque payment_date era nulo o malformado), isOk seguirá siendo false.
            if (pDateObj && !isNaN(pDateObj.getTime())) {
                pDateObj.setHours(0, 0, 0, 0);
            
                if (term.includes('DIARIO')) {
                    if (pDateObj.getTime() === todayMidnight.getTime()) isOk = true;
                } else if (term.includes('SEMANAL')) {
                    const dayOfWeek = todayMidnight.getDay(); 
                    const diff = todayMidnight.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
                    const mondayThisWeek = new Date(todayMidnight);
                    mondayThisWeek.setDate(diff);
                    mondayThisWeek.setHours(0,0,0,0);
                    
                    if (pDateObj >= mondayThisWeek) isOk = true;
                }
            }
        }

        const el = document.getElementById(elementId);
        if (el) {
            el.innerHTML = isOk 
                ? '<span class="status-ok"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span>' 
                : '<span class="status-bad"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg></span>';
        }
    } catch (e) { console.error(e); }
}

async function openDetailsModal(data) {
    // loadDebtors(true); // Se elimina la recarga para evitar parpadeos innecesarios.
    const modal = document.getElementById('details-modal');
    modal.classList.remove('hidden');

    // Reiniciar estado del botón PAGO inmediatamente para evitar condiciones de carrera
    const btnPay = document.getElementById('btn-detail-pay');
    btnPay.onclick = null; // Eliminar eventos anteriores
    btnPay.disabled = true; // Deshabilitar mientras carga

    // 1. Mostrar y capturar fecha de préstamo del texto
    document.getElementById('detail-loan-date').textContent = data.sale_date || '';
    const loanDateText = document.getElementById('detail-loan-date').textContent;

    document.getElementById('detail-loan-day').textContent = data.loan_day || '';
    document.getElementById('detail-remaining').textContent = data.remaining_payments || 0;

    // Calcular fecha vencimiento
    const dueDateStr = calculateDueDate(loanDateText, data.number_of_payments, data.payment_term);
    document.getElementById('detail-due-date').textContent = dueDateStr;

    // Estado (Cuadrado de color)
    let squareColor = 'grey';
    const term = (Array.isArray(data.payment_term) ? data.payment_term[0] : data.payment_term || '').toUpperCase();
    const balance = data.balance || 0;
    const remaining = data.remaining_payments || 0;

    if ((term.includes('SEMANAL') && remaining === 1) || (term.includes('DIARIO') && remaining === 5)) {
        squareColor = 'green';
    } else if ((term.includes('SEMANAL') && balance <= 40000) || (term.includes('DIARIO') && balance <= 20000)) {
        squareColor = 'yellow';
    }
    document.getElementById('detail-status-square').style.backgroundColor = squareColor;

    // Cargar último pago
    document.getElementById('detail-last-pay-date').textContent = 'Cargando...';
    document.getElementById('detail-last-pay-amount').textContent = '...';
    document.getElementById('detail-status-icon').innerHTML = '';

    // Consultar Pagos
    const { data: payments } = await window.supabaseClient
        .from('payments')
        .select('*')
        .eq('cedula', data.cedula)
        .eq('debtor_number', data.debtor_number);

    if (payments && payments.length > 0) {
        // Ordenar en JS por payment_date real (Descendente: más nuevo primero)
        payments.sort((a, b) => parsePaymentDate(b.payment_date) - parsePaymentDate(a.payment_date));
        
        const last = payments[0];
        // Usar payment_date que ya está en formato DD-MM-YYYY
        document.getElementById('detail-last-pay-date').textContent = last.payment_date || 'N/A';
        document.getElementById('detail-last-pay-day').textContent = last.payment_day || '';
        document.getElementById('detail-last-pay-amount').textContent = formatCurrency(last.payment_amount);
    } else {
        document.getElementById('detail-last-pay-date').textContent = 'Sin pagos';
        document.getElementById('detail-last-pay-day').textContent = '...';
        document.getElementById('detail-last-pay-amount').textContent = '-';
    }

    // --- Lógica de Bloqueo de Botón de Pago (Alertas) ---
    btnPay.disabled = false;
    btnPay.textContent = 'PAGO';
    btnPay.style.opacity = '1';
    btnPay.style.cursor = 'pointer';
    currentApprovedAlert = null; // Resetear alerta aprobada
    currentApprovedReprestAlert = null; // Resetear alerta de represte

    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    let isBlocked = false; // Bandera para controlar el bloqueo definitivo
    
    // --- Lógica de Bloqueo de Botón de Pago (REPRESTE) ---
    const { data: represtAlerts } = await window.supabaseClient
        .from('alerts_represt')
        .select('*')
        .eq('cedula', data.cedula)
        .eq('debtor_number', data.debtor_number)
        .limit(1);

    if (represtAlerts && represtAlerts.length > 0) {
        const alert = represtAlerts[0];
        if (alert.represt === false) { // PENDIENTE
            btnPay.disabled = true;
            btnPay.textContent = 'ESPERANDO';
            btnPay.style.opacity = '0.5';
            btnPay.style.cursor = 'not-allowed';
            isBlocked = true; // Marcar como bloqueado
        } else if (alert.represt === true) { // APROBADO
            currentApprovedReprestAlert = alert;
        }
    }

    // Solo ejecutar lógica de límites si NO está ya bloqueado por Represte
    if (!isBlocked && !isPrivileged && payments && payments.length > 0) {
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = todayMidnight.getDay(); 
        const diff = todayMidnight.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
        const mondayThisWeek = new Date(todayMidnight);
        mondayThisWeek.setDate(diff);
        mondayThisWeek.setHours(0,0,0,0);

        let currentPeriodPayments = 0;
        payments.forEach(p => {
            const pDate = parsePaymentDate(p.payment_date);
            pDate.setHours(0,0,0,0);
            if (term.includes('DIARIO') && pDate.getTime() === todayMidnight.getTime()) currentPeriodPayments++;
            else if (term.includes('SEMANAL') && pDate >= mondayThisWeek) currentPeriodPayments++;
        });

        if (currentPeriodPayments >= 2) {
            // Ya tiene 2 pagos, bloquear hasta siguiente periodo
            btnPay.disabled = true;
            btnPay.style.opacity = '0.5';
            btnPay.style.cursor = 'not-allowed';
        } else if (currentPeriodPayments === 1) {
            // Tiene 1 pago, verificar si tiene alerta aprobada para permitir el segundo
            const { data: alerts } = await window.supabaseClient
                .from('payments_alerts')
                .select('*')
                .eq('cedula', data.cedula)
                .eq('debtor_number', data.debtor_number)
                .eq('payment_date', getFormattedDate());
            
            // Nota: Si es semanal, la fecha de la alerta debe coincidir con el dia que se pidio.
            // Simplificacion: Buscamos alerta con fecha de HOY o dentro de la semana si es semanal
            // Para ser precisos con la peticion: "si el dia o semana actual esa alerta no se atiende... la ignorara"
            
            let activeAlert = null;
            if (alerts) {
                activeAlert = alerts.find(a => {
                     // Validar que la alerta corresponda al periodo actual (aunque filtramos por fecha exacta arriba, mejor asegurar)
                     return true; 
                });
            }

            if (activeAlert && activeAlert.pay === true) {
                // Aprobado: Habilitar y guardar referencia para usar el monto
                btnPay.disabled = false;
                currentApprovedAlert = activeAlert;
            } else {
                // No hay alerta, o es null (pendiente), o false (rechazada) -> Bloquear
                // Si es null (pendiente), el icono es naranja, pero el boton debe estar bloqueado
                // Si es false (rechazado), el icono es verde, boton bloqueado
                // Si no existe alerta, boton bloqueado (requiere pedir permiso al intentar pagar, pero aqui solo vemos detalles)
                // Espera... Si no existe alerta, el usuario debe poder dar click para que salga el modal de "Pedir permiso".
                // Entonces: Solo bloqueamos si hay alerta PENDIENTE (null) o RECHAZADA (false).
                // Si NO hay alerta, habilitamos para que al dar click salte la validacion en registerPayment.
                
                if (activeAlert) {
                    if (activeAlert.pay === null || activeAlert.pay === false) {
                        btnPay.disabled = true;
                        btnPay.style.opacity = '0.5';
                        btnPay.style.cursor = 'not-allowed';
                    }
                }
                // Si no hay alerta, dejamos habilitado.
            }
        }
    }

    // Botón Historial
    document.getElementById('btn-detail-history').onclick = async () => {
        const hModal = document.getElementById('payment-history-modal');
        const hContainer = document.getElementById('history-list-container');
        hModal.classList.remove('hidden');
        hContainer.innerHTML = 'Cargando...';

        const { data: history } = await window.supabaseClient
            .from('payments')
            .select('*')
            .eq('cedula', data.cedula)
            .eq('debtor_number', data.debtor_number);

        hContainer.innerHTML = '';
        if (history) {
            // Ordenar historial también por fecha real
            history.sort((a, b) => parsePaymentDate(b.payment_date) - parsePaymentDate(a.payment_date));
            history.forEach(p => {
                hContainer.innerHTML += `<div class="table-row"><div>${p.payment_date || 'N/A'}</div><div>${formatCurrency(p.payment_amount)}</div><div>${p.payment_method}</div></div>`;
            });
        }
    };

    // Botón PAGO
    document.getElementById('btn-detail-pay').onclick = () => {
        // Prevenir acción si el botón está deshabilitado (ej. en estado "ESPERANDO")
        if (document.getElementById('btn-detail-pay').disabled) {
            return;
        }
        selectedDebtorForPayment = data;
        document.getElementById('details-modal').classList.add('hidden');
        showPaymentScreen();
    };
}

// Función auxiliar para calcular fecha de vencimiento
function calculateDueDate(dateString, installments, paymentTerm) {
    const numInstallments = parseInt(installments);
    if (!dateString || !numInstallments) return '---';

    const parts = dateString.split('-');
    if (parts.length !== 3) return '---';

    const loanDate = new Date(parts[2], parts[1] - 1, parts[0]);
    
    const term = (Array.isArray(paymentTerm) ? paymentTerm[0] : paymentTerm) || '';
    const daysToAdd = term.toUpperCase().includes('SEMANAL') ? (numInstallments * 7) : numInstallments;

    const dueDate = new Date(loanDate);
    dueDate.setDate(dueDate.getDate() + daysToAdd);

    const dd = String(dueDate.getDate()).padStart(2, '0');
    const mm = String(dueDate.getMonth() + 1).padStart(2, '0');
    const yy = dueDate.getFullYear();

    return `${dd}-${mm}-${yy}`;
}

function closeDetailsModal() {
    document.getElementById('details-modal').classList.add('hidden');
    // loadDebtors(true); // Se elimina la recarga para evitar parpadeos innecesarios.
}
window.closeDetailsModal = closeDetailsModal;

function returnToDebtors() {
    document.getElementById('registrar-pago-section').classList.add('hidden');
    document.getElementById('ver-deudores-section').classList.remove('hidden');
    
    // Se fuerza la recarga del listado para reflejar cambios (como un pago recién hecho).
    loadDebtors(false);
    if (debtorsRefreshInterval) clearInterval(debtorsRefreshInterval);

    // Se ha eliminado la autoconsulta para evitar recargas inesperadas.
    // debtorsRefreshInterval = setInterval(() => {
    //     loadDebtors(true);
    // }, 5000);
}
window.returnToDebtors = returnToDebtors;

// --- FUNCIONES REGISTRAR PAGO ---

function showPaymentScreen() {
    if (debtorsRefreshInterval) clearInterval(debtorsRefreshInterval);
    document.getElementById('ver-deudores-section').classList.add('hidden');
    document.getElementById('registrar-pago-section').classList.remove('hidden');

    if (selectedDebtorForPayment) {
        const data = selectedDebtorForPayment;
        
        document.getElementById('pay-client').value = data.name || '';
        document.getElementById('pay-cedula').value = data.cedula || '';
        document.getElementById('pay-phone').value = data.phone || '';
        document.getElementById('pay-address').value = data.address || '';
        document.getElementById('pay-balance').value = formatCurrency(data.balance);
        document.getElementById('pay-date').value = getFormattedDate(); // Fecha actual fija
        document.getElementById('pay-remaining').value = data.remaining_payments || 0;
        document.getElementById('pay-amount').value = '';
        document.getElementById('pay-method').value = 'Efectivo';
        
        // Mostrar asesor si es administrador
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
        const asesorInput = document.getElementById('pay-asesor');
        const asesorLabel = document.getElementById('pay-asesor-lbl');
        if (isPrivileged) {
            asesorLabel.classList.remove('hidden');
            asesorInput.classList.remove('hidden');
            asesorInput.value = data.asesor_name || '';
        } else {
            asesorLabel.classList.add('hidden');
            asesorInput.classList.add('hidden');
        }

        // Configuración de permisos de edición
        
        const nameInput = document.getElementById('pay-client');
        const cedulaInput = document.getElementById('pay-cedula');
        const phoneInput = document.getElementById('pay-phone');
        const addressInput = document.getElementById('pay-address');

        // Resetear listeners clonando
        const newCedulaInput = cedulaInput.cloneNode(true);
        cedulaInput.parentNode.replaceChild(newCedulaInput, cedulaInput);

        if (isPrivileged) {
            // Admin/Dev: Todo editable menos fecha y saldo
            nameInput.removeAttribute('readonly');
            newCedulaInput.removeAttribute('readonly');
            phoneInput.removeAttribute('readonly');
            addressInput.removeAttribute('readonly');
        } else {
            // Usuario: Restricciones similares a Crédito
            nameInput.setAttribute('readonly', true);
            phoneInput.removeAttribute('readonly');
            addressInput.removeAttribute('readonly');
            
            // Cédula editable una sola vez (como en Represte)
            newCedulaInput.removeAttribute('readonly');
            newCedulaInput.addEventListener('blur', function() {
                this.setAttribute('readonly', true);
            }, { once: true });
        }

        // Lógica de Monto Fijo para Pagos Aprobados (Segundo Pago o Represte)
        const amountInput = document.getElementById('pay-amount');
        if (currentApprovedAlert) {
            amountInput.value = formatCurrency(currentApprovedAlert.payment_amount);
            amountInput.setAttribute('readonly', true);
        } else if (currentApprovedReprestAlert) {
            amountInput.value = formatCurrency(currentApprovedReprestAlert.payment_amount);
            amountInput.setAttribute('readonly', true);
        } else {
            amountInput.removeAttribute('readonly');
            amountInput.value = ''; // Limpiar valor para pagos normales
        }
    }
}
window.showPaymentScreen = showPaymentScreen;

async function registerPayment() {
    if (!selectedDebtorForPayment) return;

    // --- VALIDACIÓN DE SEGUNDO PAGO (USUARIOS) ---
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    
    if (!isPrivileged && selectedDebtorForPayment) {
        // Verificar pagos existentes en el periodo actual
        const { data: payments } = await window.supabaseClient
            .from('payments')
            .select('payment_date')
            .eq('cedula', selectedDebtorForPayment.cedula)
            .eq('debtor_number', selectedDebtorForPayment.debtor_number);
            
        const now = new Date();
        const todayMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const dayOfWeek = todayMidnight.getDay(); 
        const diff = todayMidnight.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1); 
        const mondayThisWeek = new Date(todayMidnight);
        mondayThisWeek.setDate(diff);
        mondayThisWeek.setHours(0,0,0,0);

        let term = (Array.isArray(selectedDebtorForPayment.payment_term) ? selectedDebtorForPayment.payment_term[0] : selectedDebtorForPayment.payment_term || '').toUpperCase();
        let currentPeriodPayments = 0;

        if (payments) {
            payments.forEach(p => {
                const pDate = parsePaymentDate(p.payment_date);
                pDate.setHours(0,0,0,0);
                if (term.includes('DIARIO') && pDate.getTime() === todayMidnight.getTime()) currentPeriodPayments++;
                else if (term.includes('SEMANAL') && pDate >= mondayThisWeek) currentPeriodPayments++;
            });
        }

        if (currentPeriodPayments >= 1) {
            // Ya hay un pago. Verificar si estamos autorizados (currentApprovedAlert)
            if (currentApprovedAlert && currentApprovedAlert.pay === true) {
                // Autorizado, proceder.
                // Validar que el monto coincida (seguridad extra)
                const inputAmount = parseCurrency(document.getElementById('pay-amount').value);
                if (inputAmount !== currentApprovedAlert.payment_amount) {
                    alert("El monto debe coincidir con el valor aprobado: " + formatCurrency(currentApprovedAlert.payment_amount));
                    return;
                }
            } else {
                // No autorizado o no hay alerta -> Mostrar Modal de Advertencia
                document.getElementById('second-payment-warning-modal').classList.remove('hidden');
                return; // Detener flujo
            }
        }
    }

    const paymentAmount = parseCurrency(document.getElementById('pay-amount').value);
    if (paymentAmount <= 0) {
        hideSpinnerAndUnblock();
        alert("El valor del abono debe ser mayor a cero.");
        return;
    }
    
    const currentBalance = selectedDebtorForPayment.balance || 0;
    if (paymentAmount > currentBalance) {
        hideSpinnerAndUnblock();
        alert("El valor del abono no puede ser mayor a la deuda actual.");
        return;
    }

    showSpinnerAndBlock();
    // Datos del formulario
    const newName = document.getElementById('pay-client').value.trim();
    const newCedula = document.getElementById('pay-cedula').value.trim();
    const newPhone = Number(document.getElementById('pay-phone').value);
    const newAddress = document.getElementById('pay-address').value.trim();

    // 1. Actualización Masiva si hubo cambios
    const originalCedula = selectedDebtorForPayment.cedula;
    const hasChanges = 
        originalCedula != newCedula ||
        selectedDebtorForPayment.name !== newName ||
        selectedDebtorForPayment.phone != newPhone ||
        selectedDebtorForPayment.address !== newAddress;

    if (hasChanges) {
        await updateClientMassive(originalCedula, {
            cedula: newCedula,
            name: newName,
            phone: newPhone,
            address: newAddress,
            municipality: selectedDebtorForPayment.municipality,
            asesor_name: selectedDebtorForPayment.asesor_name // Mantiene el mismo
        });
    }

    hideSpinnerAndUnblock(); // Hide for now, will be shown again in executePayment
    // --- LÓGICA DE VALIDACIÓN PARA REPRESTE/CIERRE ---
    const remainingBalance = currentBalance - paymentAmount;
    const currentQuotas = selectedDebtorForPayment.remaining_payments || 0;
    
    // PRIORIDAD: Si hay una alerta de Represte APROBADA, usarla independientemente de las condiciones de límite.
    if (currentApprovedReprestAlert) {
        const approvedAmount = currentApprovedReprestAlert.payment_amount;
        // Chequeo de seguridad: asegurar que el monto bloqueado es el que se usa.
        if (paymentAmount !== approvedAmount) {
            hideSpinnerAndUnblock();
            alert("El monto del represte debe ser el aprobado: " + formatCurrency(approvedAmount));
            document.getElementById('pay-amount').value = formatCurrency(approvedAmount);
            return;
        }
        executePayment(approvedAmount, false);
        return;
    }

    let term = '';
    if (Array.isArray(selectedDebtorForPayment.payment_term)) term = selectedDebtorForPayment.payment_term[0];
    else term = selectedDebtorForPayment.payment_term;
    term = (term || '').toUpperCase();

    // Condiciones:
    // 1. Pago total (remainingBalance == 0)
    // 2. Cuotas >= 2
    // 3. (Diario > 30000) O (Semanal > 60000)
    const isDailyLimit = term.includes('DIARIO') && currentBalance > 30000;
    const isWeeklyLimit = term.includes('SEMANAL') && currentBalance > 60000;

    if (remainingBalance === 0 && currentQuotas >= 2 && (isDailyLimit || isWeeklyLimit)) {
        // Caso: Es la primera vez que se activa el flujo de represte para este pago.
        // Mostrar el modal de decisión (Represte o Cerrar Tarjeta).
        document.getElementById('represte-decision-modal').classList.remove('hidden');
    } else {
        // Pago normal
        executePayment(paymentAmount, false);
    }
}
window.registerPayment = registerPayment;

// --- FUNCIONES AUXILIARES DE PAGO Y REPRESTE ---

// 1. Ejecutar Pago (Lógica centralizada)
async function executePayment(paymentAmount, closeCard = false) {
    try {
        showSpinnerAndBlock();
        // Recopilar datos para el payload de la Edge Function
        const payload = {
            selectedDebtor: selectedDebtorForPayment,
            paymentAmount: paymentAmount,
            closeCard: closeCard,
            paymentMethod: document.getElementById('pay-method').value,
            paymentDate: document.getElementById('pay-date').value,
            currentUserRole: currentUserRole,
            currentUserName: currentUserName,
            // Pasar los IDs de las alertas para que el servidor las elimine atómicamente
            approvedReprestAlertId: null, // Se elimina por separado tras el éxito
            approvedSecondPaymentAlertId: currentApprovedAlert ? currentApprovedAlert.id : null
        };

        // Invocar la Edge Function que ahora contiene toda la lógica de la transacción
        const { data, error } = await window.supabaseClient.functions.invoke('manage-payments', {
            body: {
                action: 'register',
                payload: payload
            }
        });

        if (error) {
            hideSpinnerAndUnblock();
            throw error;
        }

        // La Edge Function devuelve un objeto con el estado del éxito
        if (!data.success) {
            throw new Error(data.message); // This will be caught and hide spinner
        }

        // 2. Eliminar solicitud de represte explícitamente si existe y el pago fue exitoso
        if (currentApprovedReprestAlert) {
            // Invocar la nueva Edge Function dedicada para eliminar la alerta
            // Se envía solo la cédula para borrar todos los registros asociados a este cliente
            await window.supabaseClient.functions.invoke('delete-represt-alert', {
                body: {
                    cedula: selectedDebtorForPayment.cedula
                }
            });
        }

        // 3. Eliminar solicitud de segundo pago explícitamente si existe y el pago fue exitoso
        if (currentApprovedAlert) {
            await window.supabaseClient.functions.invoke('manage-payments', {
                body: {
                    action: 'deletePaymentAlert',
                    payload: { id: currentApprovedAlert.id }
                }
            });
        }

        // Éxito con retraso
        showSuccessWithDelay(data.message, () => {
            selectedDebtorForPayment = null;
            currentApprovedReprestAlert = null; // Limpiar estado
            currentApprovedAlert = null;      // Limpiar estado
            returnToDebtors();
        });

    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error al procesar el pago:", error);
        alert("Error: " + error.message);
    }
}

// 2. Botones del Modal de Decisión
document.getElementById('btn-decision-close-card').addEventListener('click', () => {
    document.getElementById('represte-decision-modal').classList.add('hidden');
    const paymentAmount = parseCurrency(document.getElementById('pay-amount').value);
    executePayment(paymentAmount, true); // true = cerrar tarjeta
});

document.getElementById('btn-decision-represte').addEventListener('click', async () => {
    document.getElementById('represte-decision-modal').classList.add('hidden');
    
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    const paymentAmount = parseCurrency(document.getElementById('pay-amount').value);

    if (isPrivileged) {
        // Si es administrador, registrar pago directamente sin alerta
        executePayment(paymentAmount, false);
        return;
    }

    // Crear registro en alerts_represt
    try {
        // Asegurar que la cédula del asesor esté actualizada consultando el perfil del usuario logueado
        const { data: { user } } = await window.supabaseClient.auth.getUser();
        let asesorCedula = currentUserCedula; // Usar valor global como fallback

        if (user) {
            const { data: userData, error: userError } = await window.supabaseClient
                .from('users')
                .select('cedula')
                .eq('id', user.id)
                .single();
            
            if (userError) console.error("Error obteniendo cédula del asesor:", userError);
            else if (userData) asesorCedula = userData.cedula;
        }

        if (!asesorCedula) {
            throw new Error("No se pudo obtener la cédula del asesor. La operación fue cancelada.");
        }

        const alertData = {
            cedula: String(selectedDebtorForPayment.cedula),
            debtor_number: selectedDebtorForPayment.debtor_number,
            asesor_cedula: asesorCedula,
            created_at: getLocalTimeAsUTC(),
            municipality: selectedDebtorForPayment.municipality || '',
            name: capitalizeInput(selectedDebtorForPayment.name || ''),
            payment_amount: paymentAmount,
            represt: false,
            user_name: currentUserName
        };

        // Enviar a Edge Function en lugar de insert directo
        const { data, error } = await window.supabaseClient.functions.invoke('manage-payments', {
            body: {
                action: 'createReprestAlert',
                payload: { alertData }
            }
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.message);
        
        alert("Solicitud enviada al administrador.");

        // Redirigir al listado de deudores con filtros
        document.getElementById('registrar-pago-section').classList.add('hidden');
        document.getElementById('ver-deudores-section').classList.remove('hidden');
        
        document.getElementById('filter-1').value = selectedDebtorForPayment.municipality;
        let term = (Array.isArray(selectedDebtorForPayment.payment_term) ? selectedDebtorForPayment.payment_term[0] : selectedDebtorForPayment.payment_term || '');
        document.getElementById('filter-2').value = term; 
        document.getElementById('search-debtor').value = selectedDebtorForPayment.name;

        loadDebtors();

    } catch (error) {
        alert("Error creando la solicitud de represte: " + error.message);
    }
});

// --- LÓGICA MODAL SEGUNDO PAGO ---
document.getElementById('btn-confirm-second-payment-request').addEventListener('click', async () => {
    document.getElementById('second-payment-warning-modal').classList.add('hidden');
    
    if (!selectedDebtorForPayment) return;

    const paymentAmount = parseCurrency(document.getElementById('pay-amount').value);
    const clientName = selectedDebtorForPayment.name;
    const cedula = selectedDebtorForPayment.cedula;
    const debtorNumber = selectedDebtorForPayment.debtor_number;
    const dateText = getFormattedDate();

    try {
        const alertData = {
            created_at: getLocalTimeAsUTC(),
            cedula: String(cedula),
            debtor_number: debtorNumber,
            payment_amount: paymentAmount,
            name: capitalizeInput(clientName),
            pay: null,
            payment_date: dateText,
            user_name: currentUserName
        };

        const { data, error } = await window.supabaseClient.functions.invoke('manage-payments', {
            body: {
                action: 'createPaymentAlert',
                payload: { alertData }
            }
        });

        if (error) throw error;
        if (!data.success) throw new Error(data.message);

        alert("Solicitud enviada al administrador.");

        // Redirigir al listado con filtros
        document.getElementById('registrar-pago-section').classList.add('hidden');
        document.getElementById('ver-deudores-section').classList.remove('hidden');

        // Aplicar filtros
        document.getElementById('filter-1').value = selectedDebtorForPayment.municipality;
        let term = (Array.isArray(selectedDebtorForPayment.payment_term) ? selectedDebtorForPayment.payment_term[0] : selectedDebtorForPayment.payment_term || '');
        document.getElementById('filter-2').value = term; // Diario/Semanal
        document.getElementById('search-debtor').value = clientName;

        loadDebtors(); // Recargar lista para mostrar icono naranja

    } catch (error) {
        console.error("Error creando alerta pago:", error);
        alert("Error al crear la solicitud: " + error.message);
    }
});

// Formato moneda para input de pago
document.getElementById('pay-amount').addEventListener('input', (e) => {
    e.target.value = formatCurrency(e.target.value);
});

// --- FUNCIONALIDAD DE GASTOS ---

async function openGastosTypeModal() {
    const modal = document.getElementById('gastos-type-modal');
    const btnDiario = document.getElementById('btn-gastos-diario');
    
    // Resetear estado visual
    btnDiario.disabled = false;
    btnDiario.style.backgroundColor = ''; 
    btnDiario.style.cursor = 'pointer';

    modal.classList.remove('hidden');
    // La validación de gasto existente se moverá a la función de registro
    // para permitir a los administradores seleccionar una fecha primero.
}
window.openGastosTypeModal = openGastosTypeModal;

function showDailyExpensesScreen() {
    document.getElementById('gastos-type-modal').classList.add('hidden');
    document.getElementById('home').classList.add('hidden');
    document.getElementById('gastos-diarios-section').classList.remove('hidden');
    
    // Lógica para Administrador/Desarrollador
    const adminFields = document.getElementById('gastos-admin-fields');
    const userSelect = document.getElementById('gastos-user-select');
    const cedulaInput = document.getElementById('gastos-user-cedula');
    const dateInput = document.getElementById('gastos-admin-date');
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    // Reset button state
    const btn = document.getElementById('btn-register-daily-expense');
    btn.disabled = false;
    btn.style.backgroundColor = '';
    btn.style.cursor = 'pointer';

    if (isPrivileged) {
        adminFields.classList.remove('hidden');
        userSelect.innerHTML = '<option value="" disabled selected>Seleccione un usuario</option>';
        cedulaInput.value = '';
        dateInput.value = getLocalDateISO(); // Set to today (Local)

        // Cargar usuarios con rol 'usuario'
        window.supabaseClient
            .from('users')
            .select('id, name, cedula')
            .ilike('role', 'usuario')
            .then(({ data: users }) => {
                if (users) {
                    users.forEach(u => {
                        const opt = document.createElement('option');
                        opt.value = u.id;
                        opt.textContent = u.name;
                        opt.dataset.cedula = u.cedula;
                        opt.dataset.name = u.name;
                        userSelect.appendChild(opt);
                    });
                }
            });

        const checkStatus = () => {
            const cedula = cedulaInput.value;
            const date = dateInput.value;
            if (cedula && date) {
                checkDailyExpenseStatus(cedula, date);
            }
        };

        userSelect.onchange = () => {
            const selected = userSelect.options[userSelect.selectedIndex];
            cedulaInput.value = selected.dataset.cedula || '';
            checkStatus();
        };

        dateInput.onchange = checkStatus;
    } else {
        adminFields.classList.add('hidden');
        // For normal user, check immediately for today
        checkDailyExpenseStatus(currentUserCedula, getLocalDateISO());
    }

    // Limpiar campos
    document.getElementById('expense-gasolina').value = '';
    document.getElementById('expense-almuerzo').value = '';
    document.getElementById('expense-otros').value = '';
    document.getElementById('expense-obs').value = '';
    document.getElementById('expense-total').value = '';
}
window.showDailyExpensesScreen = showDailyExpensesScreen;

async function showWeeklyExpensesScreen() {
    document.getElementById('gastos-type-modal').classList.add('hidden');
    document.getElementById('home').classList.add('hidden');
    document.getElementById('gastos-semanales-section').classList.remove('hidden');
    
    // Lógica para Administrador/Desarrollador
    const adminFields = document.getElementById('wgastos-admin-fields');
    const userSelect = document.getElementById('wgastos-user-select');
    const cedulaInput = document.getElementById('wgastos-user-cedula');
    const dateInput = document.getElementById('wgastos-admin-date');
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    if (isPrivileged) {
        adminFields.classList.remove('hidden');
        userSelect.innerHTML = '<option value="" disabled selected>Seleccione un usuario</option>';
        cedulaInput.value = '';
        dateInput.value = getCurrentSundayISO(); // Default to current Sunday
        dateInput.step = '7'; // Attempt to restrict to Sundays
        dateInput.min = '2023-01-01'; // Base Sunday for step

        const { data: users } = await window.supabaseClient
            .from('users')
            .select('id, name, cedula')
            .ilike('role', 'usuario');

        if (users) {
            users.forEach(u => {
                const opt = document.createElement('option');
                opt.value = u.id;
                opt.textContent = u.name;
                opt.dataset.cedula = u.cedula;
                opt.dataset.name = u.name;
                userSelect.appendChild(opt);
            });
        }

        const checkStatus = () => {
            const selectedDate = dateInput.value ? new Date(dateInput.value + 'T00:00:00') : null;
            checkWeeklyExpenseStatus(cedulaInput.value, selectedDate);
        };

        userSelect.onchange = () => {
            const selected = userSelect.options[userSelect.selectedIndex];
            cedulaInput.value = selected.dataset.cedula || '';
            checkStatus();
        };

        dateInput.onchange = () => {
            const selectedDate = new Date(dateInput.value + 'T00:00:00');
            if (selectedDate.getDay() !== 0) { // 0 is Sunday
                alert("Por favor, seleccione solo un domingo.");
                dateInput.value = '';
            }
            checkStatus();
        };
    } else {
        adminFields.classList.add('hidden');
        checkWeeklyExpenseStatus();
    }

    // Limpiar campos
    document.getElementById('wexpense-almuerzo').value = '';
    document.getElementById('wexpense-gasolina').value = '';
    document.getElementById('wexpense-otros').value = '';
    document.getElementById('wexpense-obs').value = '';
    document.getElementById('wexpense-total').value = '';
}
window.showWeeklyExpensesScreen = showWeeklyExpensesScreen;

// Función para verificar si ya existe un gasto diario y deshabilitar el botón
async function checkDailyExpenseStatus(targetCedula, selectedDateStr) {
    const btn = document.getElementById('btn-register-daily-expense');
    // Reset state
    btn.disabled = false;
    btn.style.backgroundColor = '';
    btn.style.cursor = 'pointer';

    if (!targetCedula || !selectedDateStr) {
        return; // Not enough info to check
    }

    try {
        const { data, error } = await window.supabaseClient
            .from('expenses')
            .select('report_number')
            .eq('asesor_cedula', targetCedula)
            .eq('expenses_date', selectedDateStr)
            .limit(1);

        if (error) throw error;

        if (data && data.length > 0) {
            btn.disabled = true;
            btn.style.backgroundColor = '#ccc';
            btn.style.cursor = 'not-allowed';
        }
    } catch (e) {
        console.error("Error checking daily expense status:", e);
    }
}

// Cálculos Gastos Diarios
function calculateDailyExpenses() {
    const gas = parseCurrency(document.getElementById('expense-gasolina').value);
    const lunch = parseCurrency(document.getElementById('expense-almuerzo').value);
    const others = parseCurrency(document.getElementById('expense-otros').value);
    
    const total = gas + lunch + others;
    document.getElementById('expense-total').value = formatCurrency(total);
}

['expense-gasolina', 'expense-almuerzo', 'expense-otros'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', (e) => {
            e.target.value = formatCurrency(e.target.value);
            calculateDailyExpenses();
        });
    }
});

async function registerDailyExpense() {
    const fuelStr = document.getElementById('expense-gasolina').value;
    const lunchStr = document.getElementById('expense-almuerzo').value;
    const othersStr = document.getElementById('expense-otros').value;
    const obs = document.getElementById('expense-obs').value.trim();
    const totalStr = document.getElementById('expense-total').value;

    const fuel = parseCurrency(fuelStr);
    const lunch = parseCurrency(lunchStr);
    const othersAmount = parseCurrency(othersStr);
    const total = parseCurrency(totalStr);

    try {
        showSpinnerAndBlock();
        let targetUserName, targetCedula;
        let expenseDateForDisplay; // Formato DD-MM-YYYY para UI
        let expenseDateForDB;      // Formato YYYY-MM-DD para la base de datos
        let createdAt = getLocalTimeAsUTC(); // Por defecto hoy
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

        if (isPrivileged) {
            const userSelect = document.getElementById('gastos-user-select');
            if (!userSelect.value) {
                hideSpinnerAndUnblock();
                alert("Debe seleccionar un usuario para registrar el gasto.");
                return;
            }
            targetUserName = userSelect.options[userSelect.selectedIndex].dataset.name;
            targetCedula = document.getElementById('gastos-user-cedula').value;

            const dateValue = document.getElementById('gastos-admin-date').value;
            if (!dateValue) {
                hideSpinnerAndUnblock();
                alert("Debe seleccionar una fecha para el gasto.");
                return;
            }
            expenseDateForDB = dateValue; // El input date ya da YYYY-MM-DD
            const [year, month, day] = expenseDateForDB.split('-');
            expenseDateForDisplay = `${day}-${month}-${year}`;
            createdAt = getCreatedAtFromSelection(dateValue); // Usar fecha seleccionada + hora actual
        } else {
            targetUserName = currentUserName;
            targetCedula = currentUserCedula;
            expenseDateForDB = getLocalDateISO(); // Obtiene YYYY-MM-DD
            expenseDateForDisplay = getFormattedDate(); // Obtiene DD-MM-YYYY
        }

        // Verificar si ya existe un gasto para este usuario en esta fecha
        const { data: existingData, error: existingError } = await window.supabaseClient
            .from('expenses')
            .select('report_number')
            .eq('asesor_cedula', targetCedula)
            .eq('expenses_date', expenseDateForDB); // Usar formato YYYY-MM-DD para la consulta

        if (existingError) {
            hideSpinnerAndUnblock();
            throw existingError;
        }

        if (existingData && existingData.length > 0) { // Usar fecha para mostrar al usuario
            hideSpinnerAndUnblock();
            alert(`Ya existe un registro de gastos para ${targetUserName} en la fecha ${expenseDateForDisplay}.`);
            return;
        }
        
        // Calcular report_number (Contador global)
        const { count: expenseCount, error: countError } = await window.supabaseClient
            .from('expenses')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            hideSpinnerAndUnblock();
            throw countError;
        }
        const nextReportNumber = (expenseCount || 0) + 1;
        
        const { error } = await window.supabaseClient.from('expenses').insert([{
            created_at: createdAt,
            expenses_date: expenseDateForDB, // Usar formato YYYY-MM-DD para guardar
            fuel: fuel,
            lunch: lunch,
            others: [othersAmount, capitalizeInput(obs)], // Array compatible con JSONB o text[]
            total_expenses: total,
            asesor_cedula: targetCedula,
            user_name: targetUserName,
            report_number: nextReportNumber
        }]);

        if (error) {
            hideSpinnerAndUnblock();
            throw error;
        }

        showSuccessWithDelay("GASTO DIARIO REGISTRADO", showHomeScreen);

    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error registrando gasto:", error);
        alert("Error: " + error.message);
    }
}
window.registerDailyExpense = registerDailyExpense;

// Lógica Gastos Semanales
async function checkWeeklyExpenseStatus(targetCedula = null, selectedDate = null) {
    const btn = document.getElementById('btn-register-weekly-expense');
    // Resetear estado visual
    btn.disabled = false;
    btn.style.backgroundColor = '';
    btn.style.cursor = 'pointer';

    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
    let dateToCheck = selectedDate || new Date();

    if (isPrivileged && !selectedDate) {
        return;
    }

    // 1. Validar Día (Solo Domingos)
    if (dateToCheck.getDay() !== 0) {
        btn.disabled = true;
        btn.style.backgroundColor = '#ccc';
        btn.style.cursor = 'not-allowed';
        return;
    }

    // 2. Validar si ya existe registro en la fecha seleccionada
    try {
        let cedulaToCheck = targetCedula;
        if (!cedulaToCheck && !isPrivileged) {
            cedulaToCheck = currentUserCedula;
        }

        if (!cedulaToCheck) {
            return;
        }

        const day = String(dateToCheck.getDate()).padStart(2, '0');
        const month = String(dateToCheck.getMonth() + 1).padStart(2, '0');
        const year = dateToCheck.getFullYear();
        const dateStr = `${year}-${month}-${day}`; // Formato YYYY-MM-DD para DB

        const { data } = await window.supabaseClient
            .from('wexpenses')
            .select('report_number')
            .eq('asesor_cedula', cedulaToCheck)
            .eq('expenses_date', dateStr);

        if (data && data.length > 0) {
            btn.disabled = true;
            btn.style.backgroundColor = '#ccc';
            btn.style.cursor = 'not-allowed';
        }
    } catch (e) { console.error(e); }
}

function calculateWeeklyExpenses() {
    const lunch = parseCurrency(document.getElementById('wexpense-almuerzo').value);
    const gas = parseCurrency(document.getElementById('wexpense-gasolina').value);
    const others = parseCurrency(document.getElementById('wexpense-otros').value);
    
    const total = lunch + gas + others;
    document.getElementById('wexpense-total').value = formatCurrency(total);
}

['wexpense-almuerzo', 'wexpense-gasolina', 'wexpense-otros'].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        el.addEventListener('input', (e) => {
            e.target.value = formatCurrency(e.target.value);
            calculateWeeklyExpenses();
        });
    }
});

async function registerWeeklyExpense() {
    const lunch = parseCurrency(document.getElementById('wexpense-almuerzo').value);
    const gas = parseCurrency(document.getElementById('wexpense-gasolina').value);
    const othersAmount = parseCurrency(document.getElementById('wexpense-otros').value);
    const obs = document.getElementById('wexpense-obs').value.trim();
    const total = parseCurrency(document.getElementById('wexpense-total').value);

    try {
        showSpinnerAndBlock();
        let targetUserName, targetCedula;
        let expenseDateForDB = getLocalDateISO(); // Default YYYY-MM-DD
        let createdAt = getLocalTimeAsUTC();
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

        if (isPrivileged) {
            const userSelect = document.getElementById('wgastos-user-select');
            if (!userSelect.value) {
                hideSpinnerAndUnblock();
                alert("Debe seleccionar un usuario para registrar el gasto.");
                return;
            }
            targetUserName = userSelect.options[userSelect.selectedIndex].dataset.name;
            targetCedula = document.getElementById('wgastos-user-cedula').value;

            const dateValue = document.getElementById('wgastos-admin-date').value;
            if (!dateValue) {
                hideSpinnerAndUnblock();
                alert("Debe seleccionar una fecha para el gasto.");
                return;
            }
            const selectedDate = new Date(dateValue + 'T00:00:00');
            if (selectedDate.getDay() !== 0) {
                hideSpinnerAndUnblock();
                alert("La fecha seleccionada debe ser un domingo.");
                return;
            }
            expenseDateForDB = dateValue; // YYYY-MM-DD
            createdAt = getCreatedAtFromSelection(dateValue);
        } else {
            targetUserName = currentUserName;
            targetCedula = currentUserCedula;
            expenseDateForDB = getCurrentSundayISO(); // Ensure Sunday YYYY-MM-DD
        }
        
        // Crear fecha de visualización para alertas
        const [year, month, day] = expenseDateForDB.split('-');
        const expenseDateForDisplay = `${day}-${month}-${year}`;

        // Verificar si ya existe un gasto semanal para este usuario en esta fecha
        const { data: existingData, error: existingError } = await window.supabaseClient
            .from('wexpenses')
            .select('report_number')
            .eq('asesor_cedula', targetCedula)
            .eq('expenses_date', expenseDateForDB);

        if (existingError) {
            hideSpinnerAndUnblock();
            throw existingError;
        }

        if (existingData && existingData.length > 0) {
            hideSpinnerAndUnblock();
            alert(`Ya existe un registro de gastos semanales para ${targetUserName} en la fecha ${expenseDateForDisplay}.`);
            return;
        }

        // Calcular report_number (Contador global para wexpenses)
        const { count: wexpenseCount, error: countError } = await window.supabaseClient
            .from('wexpenses')
            .select('*', { count: 'exact', head: true });

        if (countError) {
            hideSpinnerAndUnblock();
            throw countError;
        }
        const nextReportNumber = (wexpenseCount || 0) + 1;

        const { error } = await window.supabaseClient.from('wexpenses').insert([{
            created_at: createdAt,
            expenses_date: expenseDateForDB,
            fuel: gas,
            lunch: lunch,
            others: [othersAmount, capitalizeInput(obs)],
            total_expenses: total,
            asesor_cedula: targetCedula,
            user_name: targetUserName,
            report_number: nextReportNumber
        }]);

        if (error) {
            hideSpinnerAndUnblock();
            throw error;
        }

        showSuccessWithDelay("GASTOS SEMANALES REGISTRADOS", showHomeScreen);

    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error registrando gasto semanal:", error);
        alert("Error: " + error.message);
    }
}
window.registerWeeklyExpense = registerWeeklyExpense;

// --- FUNCIONALIDAD DE REPORTES ---

function openReportesTypeModal() {
    document.getElementById('reportes-type-modal').classList.remove('hidden');
}
window.openReportesTypeModal = openReportesTypeModal;

function showDailyReportScreen() {
    document.getElementById('reportes-type-modal').classList.add('hidden');
    document.getElementById('home').classList.add('hidden');
    document.getElementById('reporte-diario-section').classList.remove('hidden');
    
    const adminFields = document.getElementById('report-daily-admin-fields');
    const userSelect = document.getElementById('report-daily-user-select');
    const dateInput = document.getElementById('report-daily-admin-date');
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    if (isPrivileged) {
        adminFields.classList.remove('hidden');
        userSelect.innerHTML = '<option value="" disabled selected>Seleccione un usuario</option>';
        dateInput.value = getLocalDateISO(); // Fecha local correcta
        
        // Cargar usuarios
        window.supabaseClient
            .from('users')
            .select('name, cedula')
            .ilike('role', 'usuario')
            .then(({ data: users }) => {
                if (users) {
                    users.forEach(u => {
                        const opt = document.createElement('option');
                        opt.value = u.name;
                        opt.textContent = u.name;
                        opt.dataset.cedula = u.cedula;
                        userSelect.appendChild(opt);
                    });
                }
            });

        const loadData = () => {
            const user = userSelect.value;
            const date = dateInput.value;
            if (user && date) {
                loadDailyReportData(user, date);
            }
        };

        userSelect.onchange = loadData;
        dateInput.onchange = loadData;
    } else {
        adminFields.classList.add('hidden');
        loadDailyReportData(currentUserName);
    }
}
window.showDailyReportScreen = showDailyReportScreen;

function showWeeklyReportScreen() {
    document.getElementById('reportes-type-modal').classList.add('hidden');
    document.getElementById('home').classList.add('hidden');
    document.getElementById('reporte-semanal-section').classList.remove('hidden');
    
    const adminFields = document.getElementById('report-weekly-admin-fields');
    const userSelect = document.getElementById('report-weekly-user-select');
    const dateInput = document.getElementById('report-weekly-admin-date');
    const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);

    if (isPrivileged) {
        adminFields.classList.remove('hidden');
        userSelect.innerHTML = '<option value="" disabled selected>Seleccione un usuario</option>';
        dateInput.value = getCurrentSundayISO(); // Default to current Sunday
        dateInput.step = '7';
        dateInput.min = '2023-01-01';
        
        window.supabaseClient
            .from('users')
            .select('name, cedula')
            .ilike('role', 'usuario')
            .then(({ data: users }) => {
                if (users) {
                    users.forEach(u => {
                        const opt = document.createElement('option');
                        opt.value = u.name;
                        opt.textContent = u.name;
                        opt.dataset.cedula = u.cedula;
                        userSelect.appendChild(opt);
                    });
                }
            });

        const loadData = () => {
            const user = userSelect.value;
            const date = dateInput.value;
            if (user && date) {
                loadWeeklyReportData(user, date);
            }
        };

        userSelect.onchange = loadData;
        dateInput.onchange = () => {
            const selectedDate = new Date(dateInput.value + 'T00:00:00');
            if (selectedDate.getDay() !== 0) { // 0 is Sunday
                alert("Por favor, seleccione solo un domingo.");
                dateInput.value = '';
                return;
            }
            loadData();
        };
    } else {
        adminFields.classList.add('hidden');
        loadWeeklyReportData(currentUserName);
    }
}
window.showWeeklyReportScreen = showWeeklyReportScreen;

// --- LÓGICA REPORTE DIARIO ---
async function loadDailyReportData(targetUserName, selectedDateStr = null) {
    if (!targetUserName) return;

    const btn = document.getElementById('btn-register-daily-report');
    
    // Resetear estado visual del botón
    btn.disabled = false;
    btn.style.backgroundColor = '';
    btn.style.cursor = 'pointer';

    // Limpiar campos visualmente mientras carga
    document.getElementById('report-daily-credits').value = 'Cargando...';
    document.getElementById('report-daily-collections').value = 'Cargando...';
    document.getElementById('report-daily-expenses').value = 'Cargando...';
    document.getElementById('report-daily-base-initial').value = 'Cargando...';
    document.getElementById('report-daily-base-final').value = 'Cargando...';

    try {
        const selectedDate = selectedDateStr ? new Date(selectedDateStr + 'T00:00:00') : new Date();
        selectedDate.setHours(0, 0, 0, 0);

        const startDate = new Date(selectedDate);
        const endDate = new Date(startDate);
        endDate.setHours(23, 59, 59, 999);

        const day = String(selectedDate.getDate()).padStart(2, '0');
        const month = String(selectedDate.getMonth() + 1).padStart(2, '0');
        const year = selectedDate.getFullYear();
        const dateStr = `${day}-${month}-${year}`;
        const dateStrISO = `${year}-${month}-${day}`; // Formato YYYY-MM-DD para expenses

        // 0. VALIDAR REPORTE EXISTENTE
        const { data: existingReport } = await window.supabaseClient
            .from('reports')
            .select('report_number')
            .eq('user_name', targetUserName)
            .eq('report_date', dateStrISO);

        if (existingReport && existingReport.length > 0) {
            btn.disabled = true;
            btn.style.backgroundColor = '#ccc';
            btn.style.cursor = 'not-allowed';
        }

        // 1. CREDITOS DEL DÍA (Solo DIARIOS)
        // Se traen todos los créditos del asesor y se filtran en el cliente por fecha para evitar problemas de zona horaria con la DB.
        const { data: credits } = await window.supabaseClient
            .from('debtors')
            .select('sale_value, payment_term, created_at')
            .eq('asesor_name', targetUserName);

        let dailyCredits = 0;
        if (credits) {
            credits.forEach(c => {
                if (!c.created_at) return;
                
                // Ajuste de desfase para comparación de créditos (UTC-5)
                const createdAtDate = new Date(new Date(c.created_at).getTime() - (5 * 60 * 60 * 1000));

                // Comparamos solo la parte de la fecha ajustada
                if (createdAtDate.getFullYear() === selectedDate.getFullYear() &&
                    createdAtDate.getMonth() === selectedDate.getMonth() &&
                    createdAtDate.getDate() === selectedDate.getDate()) {
                    
                    let term = Array.isArray(c.payment_term) ? c.payment_term[0] : c.payment_term;
                    term = (term || '').toUpperCase();
                    // SEGMENTACION ROBUSTA: Igualdad estricta para evitar mezcla de créditos
                    if (term === 'DIARIO') {
                        dailyCredits += (c.sale_value || 0);
                    }
                }
            });
        }

        // 2. COBROS DEL DÍA (Solo DIARIOS) + Efectivo/Transferencia
         // Ajuste de rango ISO para cubrir el día exacto en Colombia (UTC-5)
         const dayStartISO = dateStrISO + 'T05:00:00.000Z';
         const tomorrow = new Date(selectedDate);
         tomorrow.setDate(tomorrow.getDate() + 1);
         const dayEndISO = tomorrow.toISOString().split('T')[0] + 'T04:59:59.999Z';

         const { data: payments } = await window.supabaseClient
             .from('payments')
             .select('payment_amount, payment_method, debtor_number')
             .eq('user_name', targetUserName)
             .gte('created_at', dayStartISO)
             .lte('created_at', dayEndISO);
 
         let dailyCollections = 0;
         let cash = 0;
         let transfer = 0;
 
         if (payments && payments.length > 0) {
             const debtorNumbers = [...new Set(payments.map(p => p.debtor_number).filter(n => n != null))];
             const { data: debtorTerms } = await window.supabaseClient
                 .from('debtors')
                 .select('debtor_number, payment_term')
                 .in('debtor_number', debtorNumbers);
             
             const termMap = {};
             if (debtorTerms) {
                 debtorTerms.forEach(d => {
                     let t = Array.isArray(d.payment_term) ? d.payment_term[0] : d.payment_term;
                     termMap[d.debtor_number] = (t || '').toUpperCase();
                 });
             }
 
             payments.forEach(p => {
                 const dTerm = termMap[p.debtor_number];
                 // SEGMENTACION ROBUSTA: Igualdad estricta para evitar mezcla de cobros
                 if (dTerm && dTerm === 'DIARIO') {
                     const amount = p.payment_amount || 0;
                     dailyCollections += amount;
                     
                     const method = (p.payment_method || '').toUpperCase();
                     if (method.includes('EFECTIVO')) cash += amount;
                     else if (method.includes('TRANSFERENCIA')) transfer += amount;
                 }
             });
         }

        // 3. GASTOS DEL DIA
        const { data: expenses } = await window.supabaseClient
            .from('expenses')
            .select('total_expenses')
            .eq('user_name', targetUserName)
            .eq('expenses_date', dateStrISO);
        
        let dailyExpenses = 0;
        if (expenses) {
            expenses.forEach(e => dailyExpenses += (e.total_expenses || 0));
        }

        // 4. BASE INICIAL
        // Intentar buscar reporte del día anterior
        const yesterday = new Date(selectedDate);
        yesterday.setDate(yesterday.getDate() - 1);
        const yDay = String(yesterday.getDate()).padStart(2, '0');
        const yMonth = String(yesterday.getMonth() + 1).padStart(2, '0');
        const yYear = yesterday.getFullYear();
        const yesterdayStr = `${yYear}-${yMonth}-${yDay}`; // Formato ISO YYYY-MM-DD

        let initialBase = 0;
        
        const { data: yesterdayReport } = await window.supabaseClient
            .from('reports')
            .select('final_base')
            .eq('user_name', targetUserName)
            .eq('report_date', yesterdayStr)
            .maybeSingle();

        if (yesterdayReport) {
            initialBase = yesterdayReport.final_base || 0;
        } else {
            // Si no hay de ayer, buscar el último creado antes de hoy
            const { data: lastReport } = await window.supabaseClient
                .from('reports')
                .select('final_base')
                .eq('user_name', targetUserName)
                .lt('created_at', dateStrISO + 'T00:00:00.000Z')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            initialBase = lastReport ? (lastReport.final_base || 0) : 0;
        }

        // 5. BASE FINAL
        const finalBase = (dailyCollections + initialBase) - (dailyCredits + dailyExpenses);

        // Actualizar UI
        document.getElementById('report-daily-credits').value = formatCurrency(dailyCredits);
        document.getElementById('report-daily-collections').value = formatCurrency(dailyCollections);
        document.getElementById('report-daily-cash-text').textContent = 'Efectivo: ' + formatCurrency(cash);
        document.getElementById('report-daily-transfer-text').textContent = 'Transferencia: ' + formatCurrency(transfer);
        document.getElementById('report-daily-expenses').value = formatCurrency(dailyExpenses);
        document.getElementById('report-daily-base-initial').value = formatCurrency(initialBase);
        document.getElementById('report-daily-base-final').value = formatCurrency(finalBase);

    } catch (error) {
        console.error("Error loading daily report:", error);
        alert("Error cargando reporte: " + error.message);
    }
}
window.loadDailyReportData = loadDailyReportData;

async function registerDailyReport() {
    try {
        showSpinnerAndBlock();
        let targetUserName = currentUserName, reportDate = getLocalDateISO(); // Formato YYYY-MM-DD
        let targetCedula = currentUserCedula;
        let createdAt = getLocalTimeAsUTC();
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
        
        if (isPrivileged) {
            const select = document.getElementById('report-daily-user-select');
            if (select.value) {
                targetUserName = select.value;
                targetCedula = select.options[select.selectedIndex].dataset.cedula;
            } else {
                hideSpinnerAndUnblock();
                alert("Seleccione un usuario"); 
                return; 
            }
            const dateValue = document.getElementById('report-daily-admin-date').value;
            if (!dateValue) {
                hideSpinnerAndUnblock();
                alert("Seleccione una fecha");
                return;
            }
            reportDate = dateValue; // Ya viene en YYYY-MM-DD del input date
            createdAt = getCreatedAtFromSelection(dateValue);
        }

        const credits = parseCurrency(document.getElementById('report-daily-credits').value);
        const collections = parseCurrency(document.getElementById('report-daily-collections').value);
        const expenses = parseCurrency(document.getElementById('report-daily-expenses').value);
        const initialBase = parseCurrency(document.getElementById('report-daily-base-initial').value);
        const finalBase = parseCurrency(document.getElementById('report-daily-base-final').value);
        
        const cashText = document.getElementById('report-daily-cash-text').textContent;
        const transferText = document.getElementById('report-daily-transfer-text').textContent;
        
        const cash = parseCurrency(cashText.split(':')[1]);
        const transfer = parseCurrency(transferText.split(':')[1]);

        const reportPayload = {
            created_at: createdAt.toISOString(),
            credits_report: credits,
            efective_reporte: cash,
            expense_report: expenses,
            final_base: finalBase,
            initial_base: initialBase,
            payments_report: collections,
            report_date: reportDate,
            transfer_report: transfer,
            user_name: targetUserName,
            asesor_cedula: targetCedula
        };

        const { data, error } = await window.supabaseClient.functions.invoke('manage-reports', {
            body: {
                action: 'registerDailyReport',
                payload: { reportData: reportPayload }
            }
        });

        if (error) {
            hideSpinnerAndUnblock();
            if (error.context && typeof error.context.json === 'function') {
                const errorData = await error.context.json();
                throw new Error(errorData.message || 'La función devolvió un error sin mensaje.');
            }
            throw error;
        }

        if (!data.success) {
            hideSpinnerAndUnblock();
            throw new Error(data.message);
        }

        showSuccessWithDelay(data.message, showHomeScreen);

    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error registrando reporte:", error);
        alert("Error: " + error.message);
    }
}
window.registerDailyReport = registerDailyReport;

// --- LÓGICA REPORTE SEMANAL ---
async function loadWeeklyReportData(targetUserName, selectedSundayStr = null) {
    if (!targetUserName) return;

    const btn = document.getElementById('btn-register-weekly-report');
    btn.disabled = false;
    btn.style.backgroundColor = '';
    btn.style.cursor = 'pointer';

    // Limpiar campos
    document.getElementById('report-weekly-credits').value = 'Cargando...';
    document.getElementById('report-weekly-collections').value = 'Cargando...';
    document.getElementById('report-weekly-expenses').value = 'Cargando...';
    document.getElementById('report-weekly-base-initial').value = 'Cargando...';
    document.getElementById('report-weekly-base-final').value = 'Cargando...';

    try {
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
        const selectedSunday = selectedSundayStr ? new Date(selectedSundayStr + 'T00:00:00') : new Date();

        if (isPrivileged && !selectedSundayStr) {
            btn.disabled = false;
            return;
        }

        const dayOfWeek = selectedSunday.getDay();
        const diffToMonday = selectedSunday.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        const monday = new Date(selectedSunday);
        monday.setDate(diffToMonday);
        monday.setHours(0,0,0,0);

        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        sunday.setHours(23,59,59,999);
        
        const sundayDateStr = `${String(sunday.getDate()).padStart(2, '0')}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${sunday.getFullYear()}`;
        const sundayDateStrISO = `${sunday.getFullYear()}-${String(sunday.getMonth() + 1).padStart(2, '0')}-${String(sunday.getDate()).padStart(2, '0')}`; // Formato YYYY-MM-DD para wexpenses
        const mondayDateStrISO = `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;

        // 0. VALIDACIONES DEL BOTÓN
           if (selectedSunday.getDay() !== 0) {
               btn.disabled = true;
               btn.style.backgroundColor = '#ccc';
               btn.style.cursor = 'not-allowed';
           } else {
            // Validar si ya existe reporte hoy (Domingo)
               const { data: existing } = await window.supabaseClient
                .from('wreports')
                .select('report_number')
                .eq('user_name', targetUserName)
                .eq('report_date', sundayDateStrISO);

            if (existing && existing.length > 0) {
                btn.disabled = true;
                btn.style.backgroundColor = '#ccc';
                btn.style.cursor = 'not-allowed';
            }
        }

        // 1. CREDITOS DE LA SEMANA (Solo SEMANAL)        
           const { data: credits } = await window.supabaseClient
            .from('debtors')
            .select('sale_value, payment_term, created_at')
            .eq('asesor_name', targetUserName);

        let weeklyCredits = 0;
        if (credits) {
            credits.forEach(c => {
                if (!c.created_at) return;
                // Ajuste de desfase para créditos semanales
                const createdAtDate = new Date(new Date(c.created_at).getTime() - (5 * 60 * 60 * 1000));
                createdAtDate.setHours(0,0,0,0);

                if (createdAtDate >= monday && createdAtDate <= sunday) {
                    let term = Array.isArray(c.payment_term) ? c.payment_term[0] : c.payment_term;
                    term = (term || '').toUpperCase();
                    // SEGMENTACION ROBUSTA: Igualdad estricta para evitar mezcla de créditos semanales
                    if (term === 'SEMANAL') {
                        weeklyCredits += (c.sale_value || 0);
                    }
                }
            });
        }

        // 2. COBROS DE LA SEMANA (Solo SEMANAL)
        // CORRECCIÓN: Filtrar por payment_date en lugar de created_at para consistencia.
           const dateStringsForWeek = [];
        for (let i = 0; i < 7; i++) {
            const d = new Date(monday);
            d.setDate(monday.getDate() + i);
            const day = String(d.getDate()).padStart(2, '0');
            const month = String(d.getMonth() + 1).padStart(2, '0');
            const year = d.getFullYear();
            dateStringsForWeek.push(`${day}-${month}-${year}`);
        }

           // Ajuste de rango semanal para Colombia (UTC-5)
           const weekStartISO = mondayDateStrISO + 'T05:00:00.000Z';
           const nextMon = new Date(sunday);
           nextMon.setDate(sunday.getDate() + 1);
           const weekEndISO = nextMon.toISOString().split('T')[0] + 'T04:59:59.999Z';

           const { data: payments } = await window.supabaseClient
             .from('payments')
             .select('payment_amount, payment_method, debtor_number')
             .eq('user_name', targetUserName)
             .gte('created_at', weekStartISO)
             .lte('created_at', weekEndISO);
 
         let weeklyCollections = 0;
         let cash = 0;
         let transfer = 0;
 
         if (payments && payments.length > 0) {
             const debtorNumbers = [...new Set(payments.map(p => p.debtor_number).filter(n => n != null))];
             const { data: debtorTerms } = await window.supabaseClient
                 .from('debtors')
                 .select('debtor_number, payment_term')
                 .in('debtor_number', debtorNumbers);
             
             const termMap = {};
             if (debtorTerms) {
                 debtorTerms.forEach(d => {
                     let t = Array.isArray(d.payment_term) ? d.payment_term[0] : d.payment_term;
                     termMap[d.debtor_number] = (t || '').toUpperCase();
                 });
             }
 
             payments.forEach(p => {
                 const dTerm = termMap[p.debtor_number];
                 // SEGMENTACION ROBUSTA: Igualdad estricta para evitar mezcla de cobros semanales
                 if (dTerm && dTerm === 'SEMANAL') {
                     const amount = p.payment_amount || 0;
                     weeklyCollections += amount;
                     
                     const method = (p.payment_method || '').toUpperCase();
                     if (method.includes('EFECTIVO')) cash += amount;
                     else if (method.includes('TRANSFERENCIA')) transfer += amount;
                 }
             });
         }

        // 3. GASTOS DE LA SEMANA (Tabla wexpenses, registro del Domingo)
           const { data: expenses } = await window.supabaseClient
            .from('wexpenses')
            .select('total_expenses')
            .eq('user_name', targetUserName)
            .eq('expenses_date', sundayDateStrISO);
        
        let weeklyExpenses = 0;
        if (expenses) {
            expenses.forEach(e => weeklyExpenses += (e.total_expenses || 0));
        }

        // 4. BASE INICIAL SEMANAL
        // Intentar buscar reporte de la semana anterior (Domingo previo)
        const prevSunday = new Date(monday);
        prevSunday.setDate(prevSunday.getDate() - 1);
        
        const psDay = String(prevSunday.getDate()).padStart(2, '0');
        const psMonth = String(prevSunday.getMonth() + 1).padStart(2, '0');
        const psYear = prevSunday.getFullYear();
        const prevSundayStr = `${psYear}-${psMonth}-${psDay}`; // Formato ISO YYYY-MM-DD

        let initialBase = 0;

        const { data: prevWeekReport } = await window.supabaseClient
            .from('wreports')
            .select('final_base')
            .eq('user_name', targetUserName)
            .eq('report_date', prevSundayStr)
            .maybeSingle();

        if (prevWeekReport) {
            initialBase = prevWeekReport.final_base || 0;
        } else {
            // Fallback: Último reporte antes de esta semana
            const { data: lastReport } = await window.supabaseClient
                .from('wreports')
                .select('final_base')
                .eq('user_name', targetUserName)
                .lt('created_at', mondayDateStrISO + 'T00:00:00.000Z')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();
            
            initialBase = lastReport ? (lastReport.final_base || 0) : 0;
        }

        // 5. BASE FINAL
        const finalBase = (weeklyCollections + initialBase) - (weeklyCredits + weeklyExpenses);

        // Actualizar UI
        document.getElementById('report-weekly-credits').value = formatCurrency(weeklyCredits);
        document.getElementById('report-weekly-collections').value = formatCurrency(weeklyCollections);
        document.getElementById('report-weekly-cash-text').textContent = 'Efectivo: ' + formatCurrency(cash);
        document.getElementById('report-weekly-transfer-text').textContent = 'Transferencia: ' + formatCurrency(transfer);
        document.getElementById('report-weekly-expenses').value = formatCurrency(weeklyExpenses);
        document.getElementById('report-weekly-base-initial').value = formatCurrency(initialBase);
        document.getElementById('report-weekly-base-final').value = formatCurrency(finalBase);

    } catch (error) {
        console.error("Error loading weekly report:", error);
        alert("Error cargando reporte semanal: " + error.message);
    }
}
window.loadWeeklyReportData = loadWeeklyReportData;

async function registerWeeklyReport() {
    try {
        showSpinnerAndBlock();
        let targetUserName = currentUserName, reportDate = getCurrentSundayISO(); // Formato YYYY-MM-DD
        let targetCedula = currentUserCedula;
        let createdAt = getLocalTimeAsUTC();
        const isPrivileged = ['administrador', 'administrador maestro', 'desarrollador'].includes(currentUserRole);
        
           if (isPrivileged) {
            const select = document.getElementById('report-weekly-user-select');
            if (select.value) {
                targetUserName = select.value;
                targetCedula = select.options[select.selectedIndex].dataset.cedula;
            } else {
                hideSpinnerAndUnblock();
                alert("Seleccione un usuario"); 
                return; 
            }
            const dateValue = document.getElementById('report-weekly-admin-date').value;
            if (!dateValue) {
                hideSpinnerAndUnblock();
                alert("Seleccione una fecha (domingo)");
                return;
            }
            const selectedDate = new Date(dateValue + 'T00:00:00');
            if (selectedDate.getDay() !== 0) {
                hideSpinnerAndUnblock();
                alert("La fecha seleccionada debe ser un domingo.");
                return;
            }
            reportDate = dateValue; // Ya viene en YYYY-MM-DD
            createdAt = getCreatedAtFromSelection(dateValue);
        }

        const credits = parseCurrency(document.getElementById('report-weekly-credits').value);
        const collections = parseCurrency(document.getElementById('report-weekly-collections').value);
        const expenses = parseCurrency(document.getElementById('report-weekly-expenses').value);
        const initialBase = parseCurrency(document.getElementById('report-weekly-base-initial').value);
        const finalBase = parseCurrency(document.getElementById('report-weekly-base-final').value);
        
        const cashText = document.getElementById('report-weekly-cash-text').textContent;
        const transferText = document.getElementById('report-weekly-transfer-text').textContent;
        
        const cash = parseCurrency(cashText.split(':')[1]);
        const transfer = parseCurrency(transferText.split(':')[1]);

        const reportPayload = {
            created_at: createdAt.toISOString(),
            credits_report: credits,
            efective_reporte: cash,
            expense_report: expenses,
            final_base: finalBase,
            initial_base: initialBase,
            payments_report: collections,
            report_date: reportDate,
            transfer_report: transfer,
            user_name: targetUserName,
            asesor_cedula: targetCedula
        };

        const { data, error } = await window.supabaseClient.functions.invoke('manage-reports', {
            body: {
                action: 'registerWeeklyReport',
                payload: { reportData: reportPayload }
            }
        });

        if (error) {
            hideSpinnerAndUnblock();
            if (error.context && typeof error.context.json === 'function') {
                const errorData = await error.context.json();
                throw new Error(errorData.message || 'La función devolvió un error sin mensaje.');
            }
            throw error;
        }

        if (!data.success) {
            hideSpinnerAndUnblock();
            throw new Error(data.message);
        }

        showSuccessWithDelay(data.message, showHomeScreen);

    } catch (error) {
        hideSpinnerAndUnblock();
        console.error("Error registrando reporte semanal:", error);
        alert("Error: " + error.message);
    }
}

window.registerWeeklyReport = registerWeeklyReport;




// Event Listeners for Report Modal
document.getElementById('btn-close-reportes-type').addEventListener('click', () => {
    document.getElementById('reportes-type-modal').classList.add('hidden');
});
document.getElementById('btn-reporte-diario').addEventListener('click', showDailyReportScreen);
document.getElementById('btn-reporte-semanal').addEventListener('click', showWeeklyReportScreen);

});

// --- FUNCIONALIDAD BOTONES DE CONEXIÓN (INVERSIONES M&R / BASE DE DATOS) ---
// Movido fuera de DOMContentLoaded para asegurar alcance global y corregir problemas en móviles

async function handleConnectionButton(linkName) {
    // Pre-abrir ventana para evitar bloqueo de popups en móviles al usar await
    const newWindow = window.open('', '_blank');
    if (newWindow) newWindow.document.write('Cargando...');

    // 1. Verificar si el link ya existe en la tabla 'conection'
    const { data, error } = await window.supabaseClient
        .from('conection')
        .select('link_conecction')
        .eq('name_link', linkName)
        .maybeSingle();
    
    if (data) {
        // Existe, redirigir
        let url = data.link_conecction;
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
            url = 'https://' + url;
        }
        if (newWindow) {
            newWindow.location.href = url;
        } else {
            window.open(url, '_blank');
        }
    } else {
        // No existe, cerrar ventana temporal y abrir modal
        if (newWindow) newWindow.close();
        
        currentLinkNameRegistration = linkName;
        document.getElementById('link-name-input').value = linkName;
        document.getElementById('link-url-input').value = '';
        document.getElementById('register-link-modal').classList.remove('hidden');
    }
}
window.handleConnectionButton = handleConnectionButton;

async function saveConnectionLink() {
    const name = document.getElementById('link-name-input').value;
    const url = document.getElementById('link-url-input').value.trim();
    
    if(!url) {
        alert("Por favor ingrese el link");
        return;
    }

    // Pre-abrir ventana
    const newWindow = window.open('', '_blank');
    if (newWindow) newWindow.document.write('Guardando...');

    // Obtener conteo para asignar el número
    const { count } = await window.supabaseClient
        .from('conection')
        .select('*', { count: 'exact', head: true });
    
    const nextNumber = (count || 0) + 1;

    // Obtener usuario actual para registrar quien creo el link
    const { data: { user } } = await window.supabaseClient.auth.getUser();

    const { error } = await window.supabaseClient
        .from('conection')
        .insert([{
            name_link: capitalizeInput(name),
            link_conecction: url,
            number: nextNumber,
            user_id: user ? user.id : null,
            created_at: getLocalTimeAsUTC()
        }]);
    
    if(error) {
        if (newWindow) newWindow.close();
        alert("Error al guardar el link: " + error.message);
    } else {
        alert("Link registrado exitosamente");
        document.getElementById('register-link-modal').classList.add('hidden');
        
        // Redirigir inmediatamente
        let finalUrl = url;
        if (!finalUrl.startsWith('http://') && !finalUrl.startsWith('https://')) {
            finalUrl = 'https://' + finalUrl;
        }
        if (newWindow) {
            newWindow.location.href = finalUrl;
        } else {
            window.open(finalUrl, '_blank');
        }
    }
}
window.saveConnectionLink = saveConnectionLink;