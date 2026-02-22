import matriculaHandler from './matricula-handler.js';

window.SESSION = null;

export async function initSession(user) {
    const tokenResult = await user.getIdTokenResult();

    // Fallback para matrícula se não estiver nos claims
    let matricula = tokenResult.claims.matricula;
    if (!matricula && user.email) {
        matricula = matriculaHandler.fromVirtualEmail(user.email);
    }

    // Fallback para role e base
    const role = tokenResult.claims.role || "user";
    const base = tokenResult.claims.base || "fixa";

    window.SESSION = {
        uid: user.uid,
        matricula: matricula || "N/A",
        role: role,
        base: base,
        token: tokenResult.token,
        email: user.email,
        displayName: user.displayName
    };

    console.log("Sessão iniciada:", window.SESSION);
}
