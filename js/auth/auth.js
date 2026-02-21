import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { initSession } from "./session.js";

onAuthStateChanged(auth, async (user) => {
    console.log("Auth state changed:", user ? "Logged in" : "Logged out");

    if (!user) {
        // Redireciona para login se não estiver em uma página pública
        const publicPages = ['/Central/login.html', '/login.html'];
        const currentPath = window.location.pathname;

        // Redireciona para login se não for uma página pública
        if (!publicPages.some(page => currentPath.endsWith(page))) {
            window.location.href = "/Central/login.html";
        }
        return;
    }

    try {
        await initSession(user);

        // Remove a classe de loading para mostrar o conteúdo
        document.body.classList.remove("auth-loading");

        // Dispara evento customizado para scripts que dependem da sessão
        window.dispatchEvent(new CustomEvent('session-ready', { detail: window.SESSION }));

    } catch (error) {
        console.error("Erro ao inicializar sessão:", error);
    }
});

