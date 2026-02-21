import { initSession } from "./session.js";

// Inicializar Firebase se necessário (assumindo que firebase-config.js já foi carregado via script tag ou import)
// Se não, poderíamos importar aqui. Mas seguindo a estrutura sugerida:

firebase.auth().onAuthStateChanged(async (user) => {
    console.log("Auth state changed:", user ? "Logged in" : "Logget out");

    if (!user) {
        // Redireciona para login se não estiver em uma página pública
        const publicPages = ['/login.html'];
        if (!publicPages.includes(window.location.pathname)) {
            window.location.href = "/login.html";
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
        // Em caso de erro crítico, talvez deslogar?
        // firebase.auth().signOut();
    }
});
