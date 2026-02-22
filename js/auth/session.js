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
    let role = tokenResult.claims.role;

    // Fallback manual para o super-admin se os claims estiverem vazios
    if (!role && user.email === 'mms1718@auth.centralsci.internal') {
        role = "super-admin";
    }

    role = role || "user";
    const base = tokenResult.claims.base || "";

    window.SESSION = {
        uid: user.uid,
        matricula: matricula || "N/A",
        role: role,
        base: base,
        token: tokenResult.token,
        email: user.email,
        displayName: user.displayName || matricula || "Usuário"
    };

    console.log("Sessão iniciada:", window.SESSION);
}
