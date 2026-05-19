self.addEventListener('fetch', function(event) {
    // No cachea nada, solo intercepta para que Chrome valide la PWA
    event.respondWith(fetch(event.request));
});
