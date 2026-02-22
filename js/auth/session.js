import { db } from './firebase-config.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import matriculaHandler from './matricula-handler.js';

window.SESSION = null;

export async function initSession(user) {
    // 1. Obter Token e Claims (Fonte 1)
    const tokenResult = await user.getIdTokenResult();
    let { claims } = tokenResult;

    // 2. Buscar Dados do Firestore (Fonte 2 - Fonte da Verdade)
    let firestoreData = {};
    try {
        const userDoc = await getDoc(doc(db, 'usuarios', user.uid));
        if (userDoc.exists()) {
            firestoreData = userDoc.data();
            console.log("Dados do Firestore carregados:", firestoreData);
        } else {
            console.warn("Documento do usuário não encontrado no Firestore (uid:", user.uid, ")");
        }
    } catch (e) {
        console.error("Erro ao buscar dados no Firestore:", e);
    }

    // 3. Determinar Matrícula
    let matricula = firestoreData.matricula || claims.matricula;
    if (!matricula && user.email) {
        matricula = matriculaHandler.fromVirtualEmail(user.email);
    }

    // 4. Determinar Role (Prioridade: Claims -> Firestore -> Fallback Admin -> Manual)
    let role = claims.role || firestoreData.role;

    // Fallback manual para o super-admin (garantia de acesso)
    if (!role && user.email === 'mms1718@auth.centralsci.internal') {
        role = "super-admin";
    }
    role = role || "user";

    // 5. Determinar Base e Nome
    const base = firestoreData.base || claims.base || "";
    const displayName = firestoreData.displayName || firestoreData.nomeCompleto || user.displayName || matricula || "Usuário";

    // 6. Montar Sessão Global
    window.SESSION = {
        uid: user.uid,
        matricula: matricula || "N/A",
        role: role,
        base: base,
        token: tokenResult.token,
        email: user.email,
        displayName: displayName,
        ...firestoreData // Inclui outros campos extras do Firestore
    };

    console.log("Sessão inicializada (Fonte da Verdade: Firestore):", window.SESSION);
}
