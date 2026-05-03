/* Feature #004 — إعداد API */

    // API_BASE فارغ = نفس السيرفر (الباك إند)
    // جميع الطلبات تذهب إلى الباك إند، والباك إند يتصل بـ ComfyUI و OLLAMA
            function makeSessionId() {
                  try {
                        if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
                  } catch (e) {}
                  try {
                        if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
                              const a = new Uint32Array(4);
                              crypto.getRandomValues(a);
                              return 's_' + Array.from(a).map(n => n.toString(16)).join('');
                        }
                  } catch (e) {}
                  return 's_' + Date.now() + '_' + Math.floor(Math.random() * 1e9);
            }

            const API_BASE = '';
            const sid = localStorage.session_id || (localStorage.session_id = makeSessionId());

    window.API_BASE = API_BASE;
    window.currentSessionId = sid;
    
