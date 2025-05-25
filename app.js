const wsURL = 'wss://192.168.1.35:3443';

let ws = new WebSocket(wsURL);
const trackpad = document.querySelector(".trackpad");

let startX = [];
let startY = [];
let moved = false;
let isConnected = false;
const moveThreshold = 0.1;
let clickPossible = false;
const clickDelay = 50;
let twoFingerTouchStart = false;
const twoFingerMoveThreshold = 5;
let longPressTimer = null;
const longPressDuration = 500;
let isDragging = false;
let isTwoFingerGesture = false;

// Intentar reconectar si se pierde la conexión
function setupWebSocket() {
    ws = new WebSocket(wsURL);
    
    ws.onopen = () => {
        console.log("Conectado al servidor WebSocket");
        isConnected = true;
        sendDimensions();
    };
    
    ws.onclose = () => {
        console.log("Desconectado del servidor WebSocket");
        isConnected = false;
        // Intentar reconectar después de 3 segundos
        setTimeout(setupWebSocket, 3000);
    };
    
    ws.onerror = (error) => {
        console.error("Error en WebSocket:", error);
    };
    
    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            console.log("Mensaje recibido:", data);
            // Manejar mensajes del servidor si es necesario
        } catch (e) {
            console.error("Error al procesar mensaje:", e);
        }
    };
}

// Iniciar la conexión WebSocket
setupWebSocket();

const sendDimensions = () => {
    if (isConnected) {
        ws.send(JSON.stringify({
            type: "dimensions",
            payload: {
                width: trackpad.clientWidth,
                height: trackpad.clientHeight
            }
        }));
    }
};

const handleTouchMove = (e) => {
    if (!isConnected) return;
    
    if (e.touches.length > 1) {
        isTwoFingerGesture = true;

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        if (twoFingerTouchStart && e.touches.length === 2) {
            const deltaX1 = Math.abs(e.touches[0].clientX - trackpad.offsetLeft - startX[0]);
            const deltaY1 = Math.abs(e.touches[0].clientY - trackpad.offsetTop - startY[0]);
            const deltaX2 = Math.abs(e.touches[1].clientX - trackpad.offsetLeft - startX[1]);
            const deltaY2 = Math.abs(e.touches[1].clientY - trackpad.offsetTop - startY[1]);

            if (deltaX1 > twoFingerMoveThreshold || deltaY1 > twoFingerMoveThreshold ||
                deltaX2 > twoFingerMoveThreshold || deltaY2 > twoFingerMoveThreshold) {
                moved = true;
            }
        }

        return;
    }

    if (isTwoFingerGesture && e.touches.length === 1) {
        isTwoFingerGesture = false;
        startX[0] = e.touches[0].clientX - trackpad.offsetLeft;
        startY[0] = e.touches[0].clientY - trackpad.offsetTop;
        return;
    }

    const touch = e.touches[0];
    const currentX = touch.clientX - trackpad.offsetLeft;
    const currentY = touch.clientY - trackpad.offsetTop;

    const deltaX = currentX - startX[0];
    const deltaY = currentY - startY[0];

    if (Math.abs(deltaX) > moveThreshold || Math.abs(deltaY) > moveThreshold) {
        moved = true;

        if (!isDragging && longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }

        clickPossible = false;
    }

    if (isDragging) {
        ws.send(JSON.stringify({
            type: "drag",
            payload: { deltaX, deltaY }
        }));
    } else {
        ws.send(JSON.stringify({
            type: "movement",
            payload: { deltaX, deltaY }
        }));
    }

    startX[0] = currentX;
    startY[0] = currentY;
};

const handleTouchClick = (e) => {
    if (isConnected) {
        ws.send(JSON.stringify({
            type: "click",
            payload: { button: "left" }
        }));
    }
};

const handleTwoFingerTouchEnd = (e) => {
    if (twoFingerTouchStart && e.touches.length === 0 && !moved && isConnected) {
        ws.send(JSON.stringify({
            type: "click",
            payload: { button: "right" }
        }));
    }
    twoFingerTouchStart = false;
    isTwoFingerGesture = false;
};

const startDragMode = () => {
    if (isConnected) {
        isDragging = true;
        ws.send(JSON.stringify({
            type: "dragStart"
        }));
    }
};

const endDragMode = () => {
    if (isDragging && isConnected) {
        ws.send(JSON.stringify({
            type: "dragEnd"
        }));
        isDragging = false;
    }
};

const throttle = (callback, delay) => {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= delay) {
            lastCall = now;
            callback(...args);
        }
    };
};

const throttledMove = throttle(handleTouchMove, 16);

document.querySelectorAll('.action-button').forEach(button => {
    button.addEventListener('click', function () {
        if (!isConnected) return;
        
        const action = this.getAttribute('data-action');

        if (action === 'shutdown' || action === 'sleep') {
            if (!confirm(`¿Are you sure to ${action === 'shutdown' ? 'shutdown' : 'sleep'} your PC?`)) {
                return;
            }
        }

        ws.send(JSON.stringify({
            type: "media",
            payload: { command: action }
        }));

        this.classList.add('active');
        setTimeout(() => {
            this.classList.remove('active');
        }, 200);
    });
});

trackpad.addEventListener("touchmove", (e) => {
    e.preventDefault();
    throttledMove(e);
});

trackpad.addEventListener("touchstart", (e) => {
    e.preventDefault();
    startX = [];
    startY = [];
    moved = false;
    clickPossible = false;

    for (let i = 0; i < e.touches.length; i++) {
        startX.push(e.touches[i].clientX - trackpad.offsetLeft);
        startY.push(e.touches[i].clientY - trackpad.offsetTop);
    }

    if (e.touches.length === 2) {
        twoFingerTouchStart = true;
        isTwoFingerGesture = true;

        if (longPressTimer) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    } else if (e.touches.length === 1) {
        setTimeout(() => {
            clickPossible = true;
        }, clickDelay);

        if (!isTwoFingerGesture) {
            longPressTimer = setTimeout(() => {
                if (!moved) {
                    startDragMode();
                }
                longPressTimer = null;
            }, longPressDuration);
        }
    }
});

trackpad.addEventListener("touchend", (e) => {
    e.preventDefault();

    if (longPressTimer) {
        clearTimeout(longPressTimer);
        longPressTimer = null;
    }

    if (!moved && clickPossible && e.touches.length === 0 && !isTwoFingerGesture) {
        handleTouchClick(e);
    }

    if (twoFingerTouchStart && e.touches.length === 0) {
        handleTwoFingerTouchEnd(e);
    }

    if (e.touches.length === 0) {
        endDragMode();
        isTwoFingerGesture = false;
    }

    moved = false;
});

window.addEventListener("orientationchange", sendDimensions);
window.addEventListener("resize", sendDimensions);

document.addEventListener('DOMContentLoaded', function() {
    const menuToggle = document.getElementById('menuToggle');
    const menuPanel = document.getElementById('menuPanel');
    
    menuToggle.addEventListener('click', function() {
        menuPanel.classList.toggle('active');
    });
    
    // Enviar dimensiones cuando se carga la página
    if (trackpad) {
        setTimeout(sendDimensions, 500);
    }
});