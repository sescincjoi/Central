export function isAdmin() {
    return window.SESSION && (window.SESSION.role === 'admin' || window.SESSION.role === 'super-admin');
}

export function isSuperAdmin() {
    return window.SESSION && window.SESSION.role === 'super-admin';
}

export function hasRole(role) {
    return window.SESSION && window.SESSION.role === role;
}
