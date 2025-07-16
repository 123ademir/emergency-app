// Configuración global
const CONFIG = {
    API_BASE_URL: window.location.origin + '/api',
    REFRESH_INTERVAL: 30000, // 30 segundos
    MAX_RETRIES: 3,
    RETRY_DELAY: 1000
};

// Variables globales
let selectedEmergencyType = null;
let currentFilter = 'all';
let emergenciesData = [];
let refreshInterval;

// Inicialización
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 Sistema de Emergencias iniciado');
    initializeApp();
});

// Inicializar aplicación
function initializeApp() {
    setupEventListeners();
    loadEmergencies();
    loadStats();
    startAutoRefresh();
    
    // Verificar conexión con el servidor
    checkServerConnection();
}

// Event listeners
function setupEventListeners() {
    const form = document.getElementById('emergencyForm');
    form.addEventListener('submit', handleFormSubmit);
    
    // Validación en tiempo real
    const inputs = form.querySelectorAll('input, textarea');
    inputs.forEach(input => {
        input.addEventListener('input', validateField);
        input.addEventListener('blur', validateField);
    });
}

// Verificar conexión con servidor
async function checkServerConnection() {
    try {
        const response = await fetch(`${CONFIG.API_BASE_URL}/stats`);
        if (response.ok) {
            console.log('✅ Conectado al servidor');
            hideConnectionError();
        } else {
            throw new Error('Error de conexión');
        }
    } catch (error) {
        console.error('❌ Error de conexión:', error);
        showConnectionError();
    }
}

// Mostrar error de conexión
function showConnectionError() {
    const errorDiv = document.createElement('div');
    errorDiv.className = 'alert alert-danger';
    errorDiv.innerHTML = `
        <i class="fas fa-exclamation-triangle"></i>
        Error de conexión con el servidor. Verifica que el backend esté ejecutándose.
    `;
    errorDiv.id = 'connectionError';
    
    const container = document.querySelector('.main-container');
    container.insertBefore(errorDiv, container.firstChild);
}

// Ocultar error de conexión
function hideConnectionError() {
    const errorDiv = document.getElementById('connectionError');
    if (errorDiv) {
        errorDiv.remove();
    }
}

// Seleccionar tipo de emergencia
function selectEmergency(type) {
    selectedEmergencyType = type;
    document.getElementById('tipoEmergencia').value = type;
    
    // Resetear estilos de botones
    document.querySelectorAll('.emergency-btn').forEach(btn => {
        btn.style.opacity = '0.6';
        btn.style.transform = 'scale(0.95)';
    });
    
    // Activar botón seleccionado
    const selectedBtn = document.querySelector(`.btn-${type}`);
    selectedBtn.style.opacity = '1';
    selectedBtn.style.transform = 'scale(1.05)';
    
    // Mostrar feedback
    showAlert(`Has seleccionado: ${type.toUpperCase()}`, 'info');
    
    // Enfocar en el campo de ubicación
    setTimeout(() => {
        document.getElementById('ubicacion').focus();
    }, 300);
}

// Validar campo individual
function validateField(event) {
    const field = event.target;
    const value = field.value.trim();
    
    // Remover clases de validación previas
    field.classList.remove('is-valid', 'is-invalid');
    
    let isValid = true;
    
    // Validaciones específicas
    switch (field.id) {
        case 'ubicacion':
            isValid = value.length >= 5;
            break;
        case 'descripcion':
            isValid = value.length >= 10;
            break;
        case 'telefono':
            if (value) {
                isValid = /^[0-9\s\-\+\(\)]{9,}$/.test(value);
            }
            break;
    }
    
    // Aplicar clase de validación
    if (field.hasAttribute('required') && !value) {
        field.classList.add('is-invalid');
    } else if (isValid) {
        field.classList.add('is-valid');
    } else {
        field.classList.add('is-invalid');
    }
    
    return isValid;
}

// Manejar envío del formulario
async function handleFormSubmit(event) {
    event.preventDefault();
    
    if (!selectedEmergencyType) {
        showAlert('Por favor selecciona un tipo de emergencia', 'error');
        return;
    }
    
    // Validar formulario
    if (!validateForm()) {
        showAlert('Por favor corrige los errores en el formulario', 'error');
        return;
    }
    
    const formData = getFormData();
    
    // Deshabilitar botón de envío
    const submitBtn = document.getElementById('submitBtn');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Enviando...';
    submitBtn.disabled = true;
    
    try {
        await submitEmergency(formData);
        
        // Limpiar formulario
        resetForm();
        
        // Actualizar datos
        await loadEmergencies();
        await loadStats();
        
        showAlert('¡Emergencia reportada exitosamente!', 'success');
        
    } catch (error) {
        console.error('Error al enviar emergencia:', error);
        showAlert('Error al reportar emergencia. Intenta nuevamente.', 'error');
    } finally {
        // Restaurar botón
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
}

// Validar formulario completo
function validateForm() {
    const form = document.getElementById('emergencyForm');
    const inputs = form.querySelectorAll('input[required], textarea[required]');
    let isValid = true;
    
    inputs.forEach(input => {
        if (!validateField({ target: input })) {
            isValid = false;
        }
    });
    
    return isValid;
}

// Obtener datos del formulario
function getFormData() {
    return {
        tipoEmergencia: selectedEmergencyType,
        ubicacion: document.getElementById('ubicacion').value.trim(),
        descripcion: document.getElementById('descripcion').value.trim(),
        reportadoPor: document.getElementById('reportadoPor').value.trim() || 'Anónimo',
        telefono: document.getElementById('telefono').value.trim()
    };
}

// Enviar emergencia al servidor
async function submitEmergency(data) {
    const response = await fetchWithRetry(`${CONFIG.API_BASE_URL}/emergencies`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al enviar emergencia');
    }
    
    return await response.json();
}

// Resetear formulario
function resetForm() {
    document.getElementById('emergencyForm').reset();
    selectedEmergencyType = null;
    
    // Resetear botones
    document.querySelectorAll('.emergency-btn').forEach(btn => {
        btn.style.opacity = '1';
        btn.style.transform = 'scale(1)';
    });
    
    // Remover clases de validación
    document.querySelectorAll('.form-control').forEach(field => {
        field.classList.remove('is-valid', 'is-invalid');
    });
}

// Cargar emergencias
async function loadEmergencies() {
    try {
        const response = await fetchWithRetry(`${CONFIG.API_BASE_URL}/emergencies?limit=100`);
        
        if (!response.ok) {
            throw new Error('Error al cargar emergencias');
        }
        
        const data = await response.json();
        emergenciesData = data.data || [];
        
        displayEmergencies(emergenciesData);
        
    } catch (error) {
        console.error('Error al cargar emergencias:', error);
        document.getElementById('emergencyList').innerHTML = `
            <div class="alert alert-danger">
                <i class="fas fa-exclamation-triangle"></i>
                Error al cargar emergencias. Verifica la conexión.
            </div>
        `;
    }
}

// Mostrar emergencias
function displayEmergencies(emergencies) {
    const container = document.getElementById('emergencyList');
    
    if (emergencies.length === 0) {
        container.innerHTML = `
            <div class="text-center text-muted">
                <i class="fas fa-info-circle"></i>
                <p>No hay emergencias reportadas en este momento.</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = emergencies.map(emergency => createEmergencyCard(emergency)).join('');
}

// Crear card de emergencia
function createEmergencyCard(emergency) {
    const fecha = new Date(emergency.timestamp).toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
    
    const iconMap = {
        'asalto': 'fas fa-mask',
        'accidente': 'fas fa-car-crash',
        'medica': 'fas fa-ambulance',
        'incendio': 'fas fa-fire',
        'otra': 'fas fa-question'
    };
    
    const priorityLabel = {
        'baja': 'Baja',
        'media': 'Media',
        'alta': 'Alta',
        'critica': 'Crítica'
    };
    
    const statusLabel = {
        'activo': 'Activo',
        'en_proceso': 'En Proceso',
        'resuelto': 'Resuelto'
    };
    
    return `
        <div class="emergency-item animate-slide-in" data-status="${emergency.estado}">
            <div class="emergency-header">
                <div class="d-flex align-items-center gap-2">
                    <i class="${iconMap[emergency.tipoEmergencia]} text-danger"></i>
                    <span class="emergency-type">${emergency.tipoEmergencia}</span>
                </div>
                <div class="d-flex gap-2">
                    <span class="emergency-priority priority-${emergency.prioridad || 'media'}">
                        ${priorityLabel[emergency.prioridad || 'media']}
                    </span>
                    <span class="status-badge status-${emergency.estado}">
                        ${statusLabel[emergency.estado]}
                    </span>
                </div>
            </div>
            
            <div class="emergency-location">
                <i class="fas fa-map-marker-alt"></i>
                ${emergency.ubicacion}
            </div>
            
            <div class="emergency-description">
                ${emergency.descripcion}
            </div>
            
            <div class="emergency-meta">
                <div>
                    <i class="fas fa-clock"></i>
                    ${fecha}
                </div>
                <div>
                    ${emergency.reportadoPor !== 'Anónimo' 
                        ? `<i class="fas fa-user"></i> ${emergency.reportadoPor}` 
                        : '<i class="fas fa-user-secret"></i> Anónimo'
                    }
                </div>
            </div>
        </div>
    `;
}

// Filtrar emergencias
function filterEmergencies(status) {
    currentFilter = status;
    
    // Actualizar botones de filtro
    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    event.target.classList.add('active');
    
    // Filtrar datos
    let filteredData = emergenciesData;
    
    if (status !== 'all') {
        filteredData = emergenciesData.filter(emergency => emergency.estado === status);
    }
    
    displayEmergencies(filteredData);
}

// Cargar estadísticas
async function loadStats() {
    try {
        const response = await fetchWithRetry(`${CONFIG.API_BASE_URL}/stats`);
        
        if (!response.ok) {
            throw new Error('Error al cargar estadísticas');
        }
        
        const data = await response.json();
        displayStats(data.data);
        
    } catch (error) {
        console.error('Error al cargar estadísticas:', error);
    }
}

// Mostrar estadísticas
function displayStats(stats) {
    const container = document.getElementById('statsContainer');
    
    if (!stats) {
        container.innerHTML = '';
        return;
    }
    
    container.innerHTML = `
        <div class="stat-card">
            <div class="stat-number">${stats.total || 0}</div>
            <div class="stat-label">Total</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.activas || 0}</div>
            <div class="stat-label">Activas</div>
        </div>
        <div class="stat-card">
            <div class="stat-number">${stats.resueltas || 0}</div>
            <div class="stat-label">Resueltas</div>
        </div>
    `;
}

// Iniciar actualización automática
function startAutoRefresh() {
    refreshInterval = setInterval(() => {
        loadEmergencies();
        loadStats();
    }, CONFIG.REFRESH_INTERVAL);
    
    console.log(`🔄 Actualización automática cada ${CONFIG.REFRESH_INTERVAL/1000} segundos`);
}

// Fetch con reintentos
async function fetchWithRetry(url, options = {}, retries = CONFIG.MAX_RETRIES) {
    try {
        const response = await fetch(url, options);
        return response;
    } catch (error) {
        if (retries > 0) {
            console.log(`Reintentando... (${CONFIG.MAX_RETRIES - retries + 1}/${CONFIG.MAX_RETRIES})`);
            await new Promise(resolve => setTimeout(resolve, CONFIG.RETRY_DELAY));
            return fetchWithRetry(url, options, retries - 1);
        }
        throw error;
    }
}

// Mostrar alertas
function showAlert(message, type = 'info') {
    // Remover alertas anteriores
    document.querySelectorAll('.alert').forEach(alert => {
        if (alert.id !== 'connectionError') {
            alert.remove();
        }
    });
    
    const alertDiv = document.createElement('div');
    alertDiv.className = `alert alert-${type === 'error' ? 'danger' : type === 'success' ? 'success' : 'info'} animate-fade-in`;
    
    const iconMap = {
        'error': 'fas fa-exclamation-circle',
        'success': 'fas fa-check-circle',
        'info': 'fas fa-info-circle'
    };
    
    alertDiv.innerHTML = `
        <i class="${iconMap[type]}"></i>
        ${message}
    `;
    
    const form = document.querySelector('.emergency-form');
    form.insertBefore(alertDiv, form.firstChild);
    
    // Auto-remover después de 5 segundos
    setTimeout(() => {
        alertDiv.remove();
    }, 5000);
}

// Utilidades
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('es-ES', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

// Manejo de errores globales
window.addEventListener('error', function(e) {
    console.error('Error global:', e.error);
    showAlert('Ha ocurrido un error inesperado', 'error');
});

// Cleanup al cerrar
window.addEventListener('beforeunload', function() {
    if (refreshInterval) {
        clearInterval(refreshInterval);
    }
});

// Exportar funciones globales
window.selectEmergency = selectEmergency;
window.filterEmergencies = filterEmergencies;