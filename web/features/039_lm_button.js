/* Feature #039 — LM toggle button (send to OLLAMA) */
(function(){
  'use strict';

  function _t(key, fallback, params){
    try { if (window.t) return window.t(key, fallback, params); } catch(e) {}
    return fallback;
  }

  function ensureStyles(){
    if (document.getElementById('lm-toggle-styles')) return;
    const st = document.createElement('style');
    st.id = 'lm-toggle-styles';
    st.textContent = `
      #lmBtn{ width:28px;height:28px;border:none;border-radius:8px;background:#757575;color:#fff;font-size:11px;font-weight:700;cursor:pointer;display:flex;align-items:center;justify-content:center; }
      #lmBtn.active{ background:#10a37f; color:#fff; box-shadow:0 0 0 2px #10a37f55; }
      #lmBtn:hover{ filter:brightness(1.15); }
      #lmBtn span{pointer-events:none}
      #lmBtn[title]{direction:rtl}
      .lm-modal{ position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.7);display:flex;align-items:center;justify-content:center;z-index:10001; }
      .lm-box{ background:white;border-radius:12px;padding:20px;max-width:400px;width:90%;box-shadow:0 4px 20px #0008; }
      .lm-box h3{ margin:0 0 12px;color:#333;font-size:16px; }
      .lm-model-list{ display:flex;flex-direction:column;gap:8px;margin-bottom:16px; }
      .lm-model-item{ padding:8px 12px;border:2px solid #ddd;border-radius:6px;cursor:pointer;background:#f9f9f9;font-size:13px;transition:all 0.2s; }
      .lm-model-item:hover{ border-color:#10a37f;background:#f0fdf8; }
      .lm-model-item.selected{ border-color:#10a37f;background:#e3f2ec;font-weight:600; }
      .lm-model-item .model-name{ font-weight:600;color:#333; }
      .lm-model-item .model-size{ font-size:11px;color:#999;margin-top:2px; }
      .lm-modal-footer{ display:flex;gap:8px;justify-content:flex-end; }
      .lm-modal-footer button{ padding:8px 16px;border:none;border-radius:6px;cursor:pointer;font-size:13px;font-weight:600; }
      .lm-modal-footer .ok-btn{ background:#10a37f;color:white; }
      .lm-modal-footer .cancel-btn{ background:#ddd;color:#333; }
    `;
    document.head.appendChild(st);
  }

  function formatBytes(bytes) {
    if (!bytes) return '?';
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(1024));
    return (bytes / Math.pow(1024, i)).toFixed(1) + sizes[i];
  }

  async function fetchAvailableModels() {
    try {
      // استخدم window.API_BASE أو افتراض نفس السيرفر
      const base = (typeof window !== 'undefined' && window.API_BASE !== undefined) ? window.API_BASE : '';
      const url = `${base}/api/ollama/models`;
      console.log('📡 Fetching OLLAMA models from:', url || 'same server');
      const res = await fetch(url);
      console.log('Response status:', res.status);
      
      if (!res.ok) {
        console.warn('❌ Models request failed:', res.status, res.statusText);
        return null;
      }
      
      const data = await res.json();
      console.log('✅ Models received:', data);
      return data.models || [];
    } catch (e) {
      console.error('❌ Error fetching models:', e);
      return null;
    }
  }

  function showModelSelector() {
    fetchAvailableModels().then(models => {
      if (!models || models.length === 0) {
        alert(_t('lm.no_models_help', '❌ لم يتم العثور على النماذج.\n\nتأكد من:\n1. تشغيل OLLAMA (ollama serve)\n2. تثبيت نموذج (ollama pull tinyllama)\n3. الاتصال بالخادم'));
        return;
      }

      const modal = document.createElement('div');
      modal.className = 'lm-modal';
      
      let selectedModel = localStorage.getItem('OLLAMA_MODEL') || models[0].name;

      modal.innerHTML = `
        <div class="lm-box">
          <h3>${_t('lm.choose_model', '📚 اختر نموذج OLLAMA')}</h3>
          <div class="lm-model-list" id="modelList"></div>
          <div class="lm-modal-footer">
            <button class="cancel-btn" onclick="this.closest('.lm-modal').remove()">${_t('common.cancel', 'إلغاء')}</button>
            <button class="ok-btn" onclick="window.selectOLLAMAModel && window.selectOLLAMAModel(); this.closest('.lm-modal').remove()">${_t('common.select', 'اختيار')}</button>
          </div>
        </div>
      `;

      const list = modal.querySelector('#modelList');
      models.forEach(m => {
        const item = document.createElement('div');
        item.className = `lm-model-item ${m.name === selectedModel ? 'selected' : ''}`;
        item.innerHTML = `
          <div class="model-name">${m.name}</div>
          <div class="model-size">${m.details?.parameter_size || '?'} • ${formatBytes(m.size)}</div>
        `;
        item.onclick = () => {
          list.querySelectorAll('.lm-model-item').forEach(x => x.classList.remove('selected'));
          item.classList.add('selected');
          selectedModel = m.name;
        };
        list.appendChild(item);
      });

      window.selectOLLAMAModel = () => {
        localStorage.setItem('OLLAMA_MODEL', selectedModel);
        window.OLLAMA_MODEL = selectedModel;
      };

      document.body.appendChild(modal);
      modal.onclick = (e) => {
        if (e.target === modal) modal.remove();
      };
    });
  }

  function createButton(){
    const composer = document.getElementById('composer');
    if (!composer) return;
    if (document.getElementById('lmBtn')) return;
    
    // تحقق من إعداد إخفاء الزر
    const isHidden = localStorage.getItem('LM_BUTTON_HIDDEN') === '1';
    if (isHidden) return; // لا تنشئ الزر إذا كان مخفياً

    const btn = document.createElement('button');
    btn.id = 'lmBtn';
    btn.title = _t('lm.button_title', 'LM: Chat with OLLAMA');
    btn.innerHTML = '<span>LM</span>';
    btn.className = 'icon-btn';
    btn.style.borderRadius = '10px';
    const toggleBtn = document.getElementById('toggleBtn');
    if (toggleBtn && toggleBtn.parentElement === composer) {
      composer.insertBefore(btn, toggleBtn.nextSibling);
    } else {
      composer.insertBefore(btn, composer.firstChild);
    }

    function sync(){
      btn.classList.toggle('active', !!window.isLMEnabled);
      btn.title = window.isLMEnabled
        ? _t('lm.button_active_title', 'LM: Chat with OLLAMA (Active)')
        : _t('lm.button_title', 'LM: Chat with OLLAMA');
    }
    sync();

    btn.addEventListener('click', function(){
      window.isLMEnabled = !window.isLMEnabled;
      localStorage.setItem('LM_ENABLED', window.isLMEnabled ? '1' : '0');
      sync();
    });

    // Right-click to select model
    btn.addEventListener('contextmenu', function(e){
      e.preventDefault();
      showModelSelector();
    });
  }

  function init(){
    ensureStyles();
    // افتراضياً معطّل دائماً ما لم يكن صريحاً '1' في localStorage
    window.isLMEnabled = (localStorage.getItem('LM_ENABLED') === '1');
    try{ window.lmTranslateArabic = (localStorage.getItem('LM_TRANSLATE_ARABIC') === '1'); }catch(_){ window.lmTranslateArabic = false; }
    
    // Load saved model or auto-detect first available
    fetchAvailableModels().then(models => {
      window.__ollamaModelsCache = Array.isArray(models) ? models : [];
      if (models && models.length > 0) {
        const saved = localStorage.getItem('OLLAMA_MODEL');
        window.OLLAMA_MODEL = saved || models[0].name;
        if (!saved) localStorage.setItem('OLLAMA_MODEL', models[0].name);
      }
      updateModelSelector(models);
    });

    // إعادة بناء نصوص القائمة عند تغيير اللغة (خصوصاً رسالة "لا توجد نماذج")
    document.addEventListener('languageChanged', function(){
      updateModelSelector(window.__ollamaModelsCache || []);
    });
    
    createButton();
    syncVisibilityToggle();
    syncTranslationToggle();
  }

  function syncVisibilityToggle(){
    const checkbox = document.getElementById('lmButtonHidden');
    if (!checkbox) return;
    
    const isHidden = localStorage.getItem('LM_BUTTON_HIDDEN') === '1';
    checkbox.checked = !isHidden; // checkbox مفعل = الزر مرئي
    
    checkbox.addEventListener('change', function(){
      const willHide = !this.checked; // إذا أنت unchecked = إخفاء
      localStorage.setItem('LM_BUTTON_HIDDEN', willHide ? '1' : '0');
      
      const btn = document.getElementById('lmBtn');
      if (willHide) {
        if (btn) btn.remove();
      } else {
        if (!btn) createButton();
      }
    });
  }

  function syncTranslationToggle(){
    const checkbox = document.getElementById('lmTranslateArabic');
    if (!checkbox) return;

    const isEnabled = localStorage.getItem('LM_TRANSLATE_ARABIC') === '1';
    checkbox.checked = isEnabled;
    window.lmTranslateArabic = isEnabled;

    if (checkbox.__bound) return;
    checkbox.__bound = true;
    checkbox.addEventListener('change', function(){
      const enabled = !!this.checked;
      localStorage.setItem('LM_TRANSLATE_ARABIC', enabled ? '1' : '0');
      window.lmTranslateArabic = enabled;
    });
  }

  function updateModelSelector(models) {
    const select = document.getElementById('ollamaModelSelect');
    if (!select) return;
    
    select.innerHTML = '';
    if (!models || models.length === 0) {
      select.innerHTML = '<option value="">' + _t('lm.no_models_install', '❌ لا توجد نماذج. قم بتثبيت: ollama pull tinyllama') + '</option>';
      return;
    }
    
    const saved = localStorage.getItem('OLLAMA_MODEL') || models[0].name;
    models.forEach(m => {
      const opt = document.createElement('option');
      opt.value = m.name;
      opt.textContent = `${m.name} (${m.details?.parameter_size || '?'}) - ${formatBytes(m.size)}`;
      if (m.name === saved) opt.selected = true;
      select.appendChild(opt);
    });
    
    if (select.onchange) return;
    select.addEventListener('change', function() {
      localStorage.setItem('OLLAMA_MODEL', this.value);
      window.OLLAMA_MODEL = this.value;
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
