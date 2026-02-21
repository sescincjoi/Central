if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/Central/sw.js', {
    scope: '/Central/'
  })
    .then(() => console.log('✅ Service Worker registrado'))
    .catch(err => console.log('❌ Falha ao registrar SW', err));
}
