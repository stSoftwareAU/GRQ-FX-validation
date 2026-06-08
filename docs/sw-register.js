// Service worker registration for GRQ FX Validation Dashboard.
//
// Australian English: this script was extracted from an inline <script>
// block in docs/index.html so the page can ship a strict
// Content-Security-Policy without 'unsafe-inline' on script-src
// (issue #23). Behaviour is otherwise unchanged from the inline version
// — same update check, same forced reload on SW updates, and the same
// 30 second update poll.

(function registerServiceWorker() {
  "use strict";

  if (!("serviceWorker" in navigator)) {
    return;
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js?v=1.0.110")
      .then((registration) => {
        console.log("SW registered: ", registration);

        // Force update check on every page load.
        registration.update();

        // Check for updates.
        registration.addEventListener("updatefound", () => {
          const newWorker = registration.installing;
          newWorker.addEventListener("statechange", () => {
            if (newWorker.state === "installed") {
              if (navigator.serviceWorker.controller) {
                // New content is available, force immediate refresh.
                console.log("New version available, forcing refresh...");

                // Force immediate update for all browsers.
                navigator.serviceWorker.controller.postMessage({
                  type: "FORCE_UPDATE",
                });
                // Force reload immediately.
                window.location.reload(true);
              } else {
                // First time installation.
                console.log("Service worker installed for the first time");
              }
            }
          });
        });

        // Listen for messages from service worker.
        navigator.serviceWorker.addEventListener("message", (event) => {
          if (event.data && event.data.type === "FORCE_RELOAD") {
            console.log("Service worker requested force reload");
            window.location.reload(true);
          }
          if (event.data && event.data.type === "SW_UPDATED") {
            console.log(
              "Service worker updated to version:",
              event.data.version,
            );
            // Force reload for all browsers when SW updates.
            console.log("SW updated, forcing reload");
            window.location.reload(true);
          }
          if (event.data && event.data.type === "INDEX_UPDATED") {
            console.log("Index.json updated in background");
            if (typeof globalThis.showUpdateAvailableNotification === "function") {
              globalThis.showUpdateAvailableNotification();
            }
          }
        });

        // Listen for messages from service worker controller.
        if (navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.addEventListener(
            "message",
            (event) => {
              if (
                event.data && event.data.type === "SW_UPDATED" &&
                event.data.forceReload
              ) {
                console.log("Force reload requested due to version update");
                window.location.reload(true);
              }
            },
          );
        }

        // Check for updates every 30 seconds.
        setInterval(() => {
          registration.update();
        }, 30000);
      })
      .catch((registrationError) => {
        console.log("SW registration failed: ", registrationError);
      });
  });

  // PWA install prompt handling removed for iPhone compatibility.
  // Users can install via Safari's "Add to Home Screen" option.
})();
