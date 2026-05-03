/* Plugin Manager - مدير الإضافات */
(function() {
  'use strict';

  const _t037 = (key, fallback, params) => {
    try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
  };
  
  window.PLUGINS_LOADED = [];
  window.PLUGIN_HOOKS = {
    onLoad: [],
    onMessageSent: [],
    onResponseReceived: [],
    onUIReady: []
  };
  
  // تسجيل إضافة
  window.registerPlugin = function(plugin) {
    if (!plugin || !plugin.id) {
      console.error('[Plugin Manager] لا يوجد معرف للإضافة');
      return;
    }
    
    console.log('[Plugin Manager] تسجيل الإضافة:', plugin.id, 'عدد الإضافات المُحملة:', window.PLUGINS_LOADED.length + 1);
    window.PLUGINS_LOADED.push(plugin);
    console.log('[Plugin Manager] الإضافات المُحملة حالياً:', window.PLUGINS_LOADED.map(p => p.id).join(', '));
    
    // تسجيل الـ hooks
    if (typeof plugin.onLoad === 'function') {
      window.PLUGIN_HOOKS.onLoad.push(plugin.onLoad);
    }
    if (typeof plugin.onMessageSent === 'function') {
      window.PLUGIN_HOOKS.onMessageSent.push(plugin.onMessageSent);
    }
    if (typeof plugin.onResponseReceived === 'function') {
      window.PLUGIN_HOOKS.onResponseReceived.push(plugin.onResponseReceived);
    }
    if (typeof plugin.onUIReady === 'function') {
      window.PLUGIN_HOOKS.onUIReady.push(plugin.onUIReady);
    }
    
    // تشغيل onLoad مباشرة
    try {
      if (typeof plugin.onLoad === 'function') {
        plugin.onLoad();
      }
    } catch(e) {
      console.error('[Plugin Manager] خطأ في تحميل الإضافة', plugin.id, e);
    }
  };
  
  // تحميل جميع الإضافات المفعّلة
  window.loadAllPlugins = async function() {
    try {
      const response = await fetch('/api/plugins/list');
      const data = await response.json();
      
      if (!data.success || !Array.isArray(data.plugins)) {
        console.warn('[Plugin Manager] لم يتم العثور على إضافات');
        return;
      }
      
      console.log('[Plugin Manager] تم العثور على', data.plugins.length, 'إضافات');
      
      for (const plugin of data.plugins) {
        if (!plugin.enabled) {
          console.log('[Plugin Manager] الإضافة معطلة:', plugin.id);
          continue;
        }
        
        if (!plugin.main) {
          console.warn('[Plugin Manager] لا يوجد ملف main للإضافة:', plugin.id);
          continue;
        }
        
        try {
          const scriptPath = `/plugins/${plugin.folder}/${plugin.main}`;
          const script = document.createElement('script');
          script.src = scriptPath;
          script.async = false;
          script.onload = function() {
            console.log('[Plugin Manager] تم تحميل:', plugin.id);
          };
          script.onerror = function() {
            console.error('[Plugin Manager] فشل تحميل:', plugin.id);
          };
          document.head.appendChild(script);
        } catch(e) {
          console.error('[Plugin Manager] خطأ في تحميل', plugin.id, e);
        }
      }
    } catch(e) {
      console.error('[Plugin Manager] فشل تحميل الإضافات:', e);
    }
  };
  
  // إطلاق حدث
  window.triggerPluginHook = function(hookName, data) {
    const hooks = window.PLUGIN_HOOKS[hookName] || [];
    hooks.forEach(function(fn) {
      try {
        fn(data);
      } catch(e) {
        console.error('[Plugin Manager] خطأ في hook', hookName, e);
      }
    });
  };
  
  // عرض نافذة الإضافات
  window.showPluginsDialog = async function() {
    try {
      const response = await fetch('/api/plugins/list');
      const data = await response.json();
      
      if (!data.success) {
        alert(_t037('plugins.load_failed', 'فشل تحميل الإضافات'));
        return;
      }
      
      const plugins = data.plugins || [];
      const isMobile = window.innerWidth <= 640;
      const dialogWidth = isMobile ? 'calc(100vw - 20px)' : '90%';
      const dialogMaxWidth = isMobile ? 'calc(100vw - 20px)' : '700px';
      const dialogPadding = isMobile ? '14px' : '24px';
      const headerGap = isMobile ? '12px' : '20px';
      
      // إنشاء النافذة
      const overlay = document.createElement('div');
      overlay.id = 'pluginsOverlay';
      overlay.style.cssText = `
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        background: rgba(0,0,0,0.7);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 10000;
      `;
      
      const dialog = document.createElement('div');
      dialog.style.cssText = `
        background: white;
        border-radius: 12px;
        width: ${dialogWidth};
        max-width: ${dialogMaxWidth};
        max-height: 80vh;
        overflow-x: hidden;
        overflow-y: auto;
        padding: ${dialogPadding};
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
      `;
      
      let html = `
        <div style="display: flex; justify-content: space-between; align-items: center; gap: 10px; margin-bottom: ${headerGap};">
          <h2 style="margin: 0; color: #333; font-size: ${isMobile ? '18px' : '24px'}; line-height: 1.2;">🔌 ${_t037('plugins.available', 'الإضافات المتاحة')}</h2>
          <button onclick="this.closest('[style*=fixed]').remove()" style="
            background: #f44336;
            color: white;
            border: none;
            border-radius: 50%;
            width: 32px;
            height: 32px;
            cursor: pointer;
            font-size: 18px;
          ">×</button>
        </div>
      `;
      
      if (plugins.length === 0) {
        html += '<p style="text-align: center; color: #999; padding: 40px;">' + _t037('plugins.none_installed', 'لا توجد إضافات مُثبتة') + '</p>';
      } else {
        html += '<div style="display: grid; gap: 16px;">';
        
        plugins.forEach(plugin => {
          const isEnabled = plugin.enabled !== false;
          const isToggle = plugin.type !== 'action';
          const cardGap = isMobile ? '12px' : '16px';
          const cardPadding = isMobile ? '12px' : '16px';
          const titleSize = isMobile ? '16px' : '18px';
          const descSize = isMobile ? '13px' : '14px';
          const metaWrap = isMobile ? 'flex-wrap: wrap;' : '';
          const actionsWidth = isMobile ? 'width: 100%; flex-direction: row; flex-wrap: wrap; justify-content: flex-start;' : 'flex-direction: column;';
          const cardDirection = isMobile ? 'flex-direction: column;' : '';
          const iconSize = isMobile ? '56px' : '64px';
          
          html += `
            <div style="
              border: 2px solid ${isEnabled ? '#4CAF50' : '#ddd'};
              border-radius: 8px;
              padding: ${cardPadding};
              display: flex;
              gap: ${cardGap};
              align-items: start;
              ${cardDirection}
              background: ${isEnabled ? '#f1f8f4' : '#f9f9f9'};
              cursor: ${!isToggle ? 'pointer' : 'default'};
              transition: all 0.2s ease;
              overflow: hidden;
            "
            onclick="${!isToggle ? `window.triggerPluginAction('${plugin.id}')` : ''}">
              <div style="
                width: ${iconSize};
                height: ${iconSize};
                background: #eee;
                border-radius: 8px;
                display: flex;
                align-items: center;
                justify-content: center;
                flex-shrink: 0;
                overflow: hidden;
              ">
                ${plugin.icon_url ? 
                  `<img src="${plugin.icon_url}" style="width: 100%; height: 100%; object-fit: cover;" onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🔌</text></svg>'">` : 
                  '<span style="font-size: 32px;">🔌</span>'
                }
              </div>
              <div style="flex: 1; min-width: 0; width: 100%;">
                <h3 style="margin: 0 0 8px 0; color: #333; font-size: ${titleSize}; word-break: break-word;">${plugin.name || plugin.name_en || plugin.id}</h3>
                <p style="margin: 0 0 8px 0; color: #666; font-size: ${descSize}; word-break: break-word;">${plugin.description || ''}</p>
                <div style="display: flex; gap: 8px; font-size: 12px; color: #999; ${metaWrap}">
                  <span>📦 ${plugin.version || '1.0.0'}</span>
                  ${plugin.author ? `<span>👤 ${plugin.author}</span>` : ''}
                  ${!isToggle ? `<span style="color: #2196F3; font-weight: bold;">▶️ ${_t037('plugins.click_to_run', 'اضغط لتنفيذ')}</span>` : ''}
                </div>
              </div>
              <div style="display: flex; gap: 8px; ${actionsWidth}">
                ${plugin.instructions ? `
                  <button onclick="event.stopPropagation(); window.showPluginInstructions('${plugin.id}')" 
                    style="background: #2196F3; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 14px; white-space: nowrap; max-width: 100%;">
                    ? ${_t037('plugins.instructions', 'تعليمات')}
                  </button>
                ` : ''}
                ${plugin.hasSettings ? `
                  <button onclick="event.stopPropagation(); window.showPluginSettings('${plugin.id}')" 
                    style="background: #FF9800; color: white; border: none; border-radius: 4px; padding: 6px 12px; cursor: pointer; font-size: 14px; white-space: nowrap; max-width: 100%;">
                    ⚙️ ${_t037('plugins.settings', 'إعدادات')}
                  </button>
                ` : ''}
                ${isToggle ? `
                  <label style="display: flex; align-items: center; cursor: pointer; justify-content: center; background: ${isEnabled ? '#4CAF50' : '#ddd'}; color: white; border-radius: 4px; padding: 6px 12px; max-width: 100%;" onclick="event.stopPropagation();">
                    <input type="checkbox" ${isEnabled ? 'checked' : ''} 
                      onchange="window.togglePlugin('${plugin.id}', this.checked)"
                      style="width: 16px; height: 16px; cursor: pointer; margin-right: 6px;">
                    <span style="font-size: 14px;">${_t037('plugins.enabled', 'فعّال')}</span>
                  </label>
                ` : ''}
              </div>
            </div>
          `;
        });
        
        html += '</div>';
      }
      
      html += `
        <div style="margin-top: 20px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #999; font-size: 14px;">
          <p style="margin: 0;">${_t037('plugins.add_new_hint', 'لإضافة إضافات جديدة، ضع المجلد في')} <code style="background: #f5f5f5; padding: 2px 8px; border-radius: 4px;">plugins/</code></p>
        </div>
      `;
      
      dialog.innerHTML = html;
      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
      
      // إغلاق عند النقر خارج النافذة
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
          overlay.remove();
        }
      });
      
    } catch(e) {
      console.error('[Plugin Manager] فشل عرض النافذة:', e);
      alert(_t037('plugins.show_failed_with_error', 'فشل عرض الإضافات: {message}', { message: e.message }));
    }
  };
  
  
  // تنفيذ عمل من إضافة
  window.triggerPluginAction = function(pluginId) {
    try {
      const plugin = window.PLUGINS_LOADED.find(p => p.id === pluginId);
      if (!plugin) {
        console.warn('[Plugin Manager] لم يتم العثور على الإضافة:', pluginId);
        return;
      }
      
      // تنفيذ الدالة onAction إذا كانت موجودة
      if (typeof plugin.onAction === 'function') {
        plugin.onAction();
        // إغلاق النافذة اختياري بحسب اختيار المطور
        if (plugin.closePluginsDialogOnAction) {
          const overlay = document.getElementById('pluginsOverlay');
          if (overlay) overlay.remove();
          console.log('[Plugin Manager] تم تنفيذ وإغلاق النافذة:', pluginId);
        } else {
          console.log('[Plugin Manager] تم تنفيذ الإضافة بدون إغلاق النافذة:', pluginId);
        }
      } else {
        alert(_t037('plugins.no_action_defined', 'هذه الإضافة لا تحتوي على عملية محددة'));
      }
    } catch(e) {
      console.error('[Plugin Manager] خطأ في تنفيذ الإضافة:', e);
      alert(_t037('errors.with_message', 'حدث خطأ: {message}', { message: e.message }));
    }
  };
  
  // تبديل حالة إضافة
  window.togglePlugin = async function(pluginId, enabled) {
    try {
      const response = await fetch(`/api/plugins/toggle/${pluginId}?enabled=${enabled}`);
      const data = await response.json();
      
      if (!data.success) {
        alert(_t037('plugins.toggle_failed', 'فشل تعديل حالة الإضافة'));
        return;
      }
      
      // إعادة تحميل الصفحة لتطبيق التغييرات
      if (confirm(_t037('plugins.confirm_reload_apply', 'سيتم إعادة تحميل الصفحة لتطبيق التغييرات. هل تريد المتابعة؟'))) {
        location.reload();
      }
    } catch(e) {
      console.error('[Plugin Manager] فشل تعديل الحالة:', e);
      alert(_t037('plugins.toggle_failed', 'فشل تعديل حالة الإضافة'));
    }
  };

  // عرض تعليمات الإضافة
  window.showPluginInstructions = async function(pluginId) {
    try {
      const response = await fetch('/api/plugins/list');
      const data = await response.json();
      
      if (!data.success || !Array.isArray(data.plugins)) {
        alert(_t037('plugins.not_found', 'لم يتم العثور على الإضافة'));
        return;
      }
      
      const plugin = data.plugins.find(p => p.id === pluginId);
      
      if (!plugin) {
        alert(_t037('plugins.not_found', 'لم يتم العثور على الإضافة'));
        return;
      }
      
      const instructions = plugin.instructions || '';
    
    // إنشاء نافذة مشروطة
    const modal = document.createElement('div');
    modal.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.5);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 10000;
      direction: rtl;
    `;
    
    modal.innerHTML = `
      <div style="background: white; border-radius: 8px; padding: 24px; max-width: 600px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
        <h2 style="margin: 0 0 16px 0; color: #333;">تعليمات: ${plugin.name || plugin.name_en || pluginId}</h2>
        
        <div style="margin-bottom: 16px; color: #666; line-height: 1.6; white-space: pre-wrap;">${instructions}</div>
        <button onclick="this.closest('div').parentElement.remove()" style="background: #2196F3; color: white; border: none; border-radius: 4px; padding: 10px 20px; cursor: pointer; width: 100%; font-size: 16px;">
          ${_t037('common.close', 'إغلاق')}
        </button>
      </div>
    `;

    modal.innerHTML = modal.innerHTML.replace('تعليمات: ', _t037('plugins.instructions_prefix', 'تعليمات: '));
    
    document.body.appendChild(modal);
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
    } catch(e) {
      console.error('[Plugin Manager] خطأ في عرض التعليمات:', e);
      alert(_t037('plugins.instructions_show_failed', 'فشل عرض التعليمات'));
    }
  };

  // عرض إعدادات الإضافة
  window.showPluginSettings = async function(pluginId) {
    try {
      console.log('[Plugin Manager] البحث عن إعدادات للإضافة:', pluginId);
      console.log('[Plugin Manager] الإضافات المُحملة:', window.PLUGINS_LOADED.map(p => p.id).join(', '));
      
      // البحث في الإضافات المُحملة (لديها onSettings)
      let loadedPlugin = window.PLUGINS_LOADED.find(p => p.id === pluginId);
      
      if (loadedPlugin && typeof loadedPlugin.onSettings === 'function') {
        console.log('[Plugin Manager] وجدت الإضافة وdialogue الإعدادات');
        // استدعاء دالة الإعدادات مباشرة
        loadedPlugin.onSettings();
        return;
      }
      
      console.log('[Plugin Manager] الإضافة لم تُحمل بعد، سأنتظر...');
      
      // إذا لم توجد أو لم تحمل بعد، احاول تحميلها من البيانات
      const response = await fetch('/api/plugins/list');
      const data = await response.json();
      
      if (!data.success || !Array.isArray(data.plugins)) {
        alert(_t037('plugins.not_found', 'لم يتم العثور على الإضافة'));
        return;
      }
      
      const pluginInfo = data.plugins.find(p => p.id === pluginId);
      if (!pluginInfo) {
        console.error('[Plugin Manager] معرّف الإضافة غير موجود:', pluginId);
        console.log('[Plugin Manager] الإضافات المتاحة:', data.plugins.map(p => p.id).join(', '));
        alert(_t037('plugins.not_found', 'لم يتم العثور على الإضافة'));
        return;
      }
      
      console.log('[Plugin Manager] معلومات الإضافة من API:', pluginInfo);
      
      // إذا كان لديها hasSettings، جرب البحث مرة أخرى بعد قليل
      if (pluginInfo.hasSettings) {
        // انتظر 1 ثانية لحين تحميل الإضافة
        for (let i = 0; i < 10; i++) {
          await new Promise(resolve => setTimeout(resolve, 100));
          loadedPlugin = window.PLUGINS_LOADED.find(p => p.id === pluginId);
          if (loadedPlugin && typeof loadedPlugin.onSettings === 'function') {
            console.log('[Plugin Manager] وجدت الإضافة بعد الانتظار!');
            loadedPlugin.onSettings();
            return;
          }
        }
      }
      
      console.error('[Plugin Manager] لم تُحمل الإضافة حتى بعد الانتظار. الإضافات المُحملة:', window.PLUGINS_LOADED.map(p => p.id).join(', '));
      alert(_t037('plugins.not_loaded_yet', 'الإضافة لم تُحمل بعد. تأكد من تفعيلها وأعد تحميل الصفحة'));
    } catch(e) {
      console.error('[Plugin Manager] خطأ في عرض الإعدادات:', e);
      alert(_t037('plugins.settings_show_failed_with_error', 'فشل عرض الإعدادات: {message}', { message: e.message }));
    }
  };
  
  // تحميل الإضافات عند تحميل الصفحة
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      window.loadAllPlugins();
    });
  } else {
    window.loadAllPlugins();
  }
  
  console.log('[Plugin Manager] تم تهيئة مدير الإضافات');
})();
