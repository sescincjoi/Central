window.SESSION = null;

export async function initSession(user) {
    const tokenResult = await user.getIdTokenResult();

    window.SESSION = {
        uid: user.uid,
        matricula: tokenResult.claims.matricula || "N/A",
        role: tokenResult.claims.role || "user",
        base: tokenResult.claims.base || "fixa",
        token: tokenResult.token
    };

    console.log("Sessão iniciada:", window.SESSION);
}
