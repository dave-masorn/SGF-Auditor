/**
 * Cache-busting version layer.
 * MUST load in <head> BEFORE any other local <script> tags.
 *
 * Strategy:
 *  1. Patch HTMLScriptElement.prototype.src so that when the HTML parser
 *     later encounters <script src="sgf_parser.js"> in <body>, our setter
 *     appends ?v=VERSION BEFORE the browser starts fetching.
 *  2. On DOMContentLoaded, also rewrite any <link href> (stylesheets load
 *     async so DOMContentLoaded catches them).
 *  3. Expose window.__SGF_VER for navigation URL busting.
 */
(function () {
    var VERSION = '0.2.006';

    /* ── Expose version globally for navigation URL busting ── */
    window.__SGF_VER = VERSION;

    /* ── 1. Intercept synchronous <script src> via prototype patch ── */
    var scriptDesc = Object.getOwnPropertyDescriptor(HTMLScriptElement.prototype, 'src');
    if (scriptDesc && scriptDesc.set) {
        Object.defineProperty(HTMLScriptElement.prototype, 'src', {
            set: function (val) {
                if (val && typeof val === 'string' &&
                    !/^https?:\/\//.test(val) &&
                    val.indexOf('?v=') === -1) {
                    val += '?v=' + VERSION;
                }
                return scriptDesc.set.call(this, val);
            },
            get: scriptDesc.get,
            configurable: true,
            enumerable: true
        });
    }

    /* ── 2. Rewrite local <link href> and <a href> on DOMContentLoaded ── */
    function bustDom() {
        var tags = document.querySelectorAll('link[rel="stylesheet"][href], a[href]');
        for (var i = 0; i < tags.length; i++) {
            var attr = tags[i].tagName === 'A' ? 'href' : 'href';
            var url = tags[i].getAttribute(attr);
            if (!url) continue;
            if (/^https?:\/\//.test(url)) continue;
            if (url.charAt(0) === '#') continue;
            if (url.indexOf('?v=') !== -1) continue;
            tags[i].setAttribute(attr, url + '?v=' + VERSION);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', bustDom);
    } else {
        bustDom();
    }

    /* ── 3. Version label ── */
    var now = new Date();
    var pad = function (n) { return n < 10 ? '0' + n : '' + n; };
    var ts  = now.getFullYear() + '-'
            + pad(now.getMonth() + 1) + '-'
            + pad(now.getDate()) + ' '
            + pad(now.getHours()) + ':'
            + pad(now.getMinutes()) + ':'
            + pad(now.getSeconds());

    var label = 'v=' + VERSION + ' (' + ts + ')';

    function applyLabel() {
        var els = document.querySelectorAll('.header-version');
        for (var i = 0; i < els.length; i++) {
            els[i].textContent = label;
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', applyLabel);
    } else {
        applyLabel();
    }
})();
