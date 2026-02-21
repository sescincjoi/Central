// js/api/api.js
const WEB_APP_URL = "https://script.google.com/macros/s/AKfycbwf7qewam6spvzEV80eVSR-yXGN9QwnuI2qDOczefVWBRlVYh77t1Rk4meq8P9_KYTyIQ/exec";

export async function apiPost(action, payload = {}) {
    if (!window.SESSION || !window.SESSION.token) {
        throw new Error("Sessão não inicializada ou token ausente");
    }

    const response = await fetch(WEB_APP_URL, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${window.SESSION.token}`,
            "Content-Type": "application/json"
        },
        body: JSON.stringify({
            action,
            ...payload
        })
    });

    if (!response.ok) {
        throw new Error(`Erro na API: ${response.statusText}`);
    }

    return response.json();
}
