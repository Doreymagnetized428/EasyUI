/* UI Shortcuts Plugin */
(function() {
  'use strict';

  const SHORTCUTS_STORAGE_KEY = 'ui_shortcuts';
  
  console.log('[UI Shortcuts] Loading...');
  
  // الاختصارات الافتراضية للموقع
  const DEFAULT_SHORTCUTS = {
    'send_message': {
      key: 'Ctrl+Enter',
      enabled: true,
      label: 'Send message',
      action: function() {
        const sendBtn = document.getElementById('sendBtn');
        if (sendBtn) sendBtn.click();
      }
    },
    'new_session': {
      key: 'Ctrl+N',
      enabled: true,
      label: 'New session',
      action: function() {
        if (window.newSession) window.newSession();
      }
    },
    'clear_chat': {
      key: 'Ctrl+K',
      enabled: true,
      label: 'Clear chat',
      action: function() {
        const chat = document.getElementById('chat');
        if (chat && confirm('Clear chat?')) {
          chat.innerHTML = '';
        }
      }
    },
    'open_user_menu': {
      key: 'Ctrl+U',
      enabled: true,
      label: 'Open user menu',
      action: function() {
        const userBtn = document.querySelector('.user-menu-btn');
        if (userBtn) userBtn.click();
      }
    },
    'open_sessions': {
      key: 'Ctrl+S',
      enabled: true,
      label: 'Open sessions panel',
      action: function() {
        const sessionsBtn = document.querySelector('.sessions-menu-btn');
        if (sessionsBtn) sessionsBtn.click();
      }
    },
    'open_templates': {
      key: 'Ctrl+T',
      enabled: true,
      label: 'Open templates',
      action: function() {
        const templatesBtn = document.getElementById('customTemplatesBtn');
        if (templatesBtn) templatesBtn.click();
      }
    },
    'open_plugins': {
      key: 'Ctrl+P',
      enabled: true,
      label: 'Open plugins',
      action: function() {
        if (window.showPluginsDialog) window.showPluginsDialog();
      }
    },
    'focus_input': {
      key: 'Ctrl+L',
      enabled: true,
      label: 'Focus input field',
      action: function() {
        const input = document.getElementById('userInput');
        if (input) input.focus();
      }
    },
    'upload_file': {
      key: 'Ctrl+Shift+U',
      enabled: true,
      label: 'Upload file',
      action: function() {
        const fileInput = document.getElementById('fileInput');
        if (fileInput) fileInput.click();
      }
    },
    'toggle_fullscreen': {
      key: 'F11',
      enabled: false,
      label: 'Toggle fullscreen',
      action: function() {
        if (!document.fullscreenElement) {
          document.documentElement.requestFullscreen();
        } else {
          if (document.exitFullscreen) {
            document.exitFullscreen();
          }
        }
      }
    },
    // Mask editor shortcuts
    'brush_tool': {
      key: 'B',
      enabled: true,
      label: '🖌️ Brush tool',
      action: function() {
        const brushBtn = document.getElementById('maskBrushTool');
        if (brushBtn && brushBtn.offsetParent !== null) {
          brushBtn.click();
        }
      }
    },
    'eraser_tool': {
      key: 'E',
      enabled: true,
      label: '🧹 Eraser tool',
      action: function() {
        const eraserBtn = document.getElementById('maskEraserTool');
        if (eraserBtn && eraserBtn.offsetParent !== null) {
          eraserBtn.click();
        }
      }
    },
    'move_tool': {
      key: 'M',
      enabled: true,
      label: '✋ Move tool',
      action: function() {
        const moveBtn = document.getElementById('maskMoveTool');
        if (moveBtn && moveBtn.offsetParent !== null) {
          moveBtn.click();
        }
      }
    },
    'clear_mask': {
      key: 'Ctrl+Shift+C',
      enabled: true,
      label: '🗑️ Clear mask',
      action: function() {
        const clearBtn = document.getElementById('maskClear');
        if (clearBtn && clearBtn.offsetParent !== null) {
          clearBtn.click();
        }
      }
    },
    'undo_mask': {
      key: 'Ctrl+Z',
      enabled: true,
      label: '↶ Undo',
      action: function() {
        const undoBtn = document.getElementById('maskUndo');
        if (undoBtn && undoBtn.offsetParent !== null) {
          undoBtn.click();
        }
      }
    },
    'redo_mask': {
      key: 'Ctrl+Y',
      enabled: true,
      label: '↷ Redo',
      action: function() {
        const redoBtn = document.getElementById('maskRedo');
        if (redoBtn && redoBtn.offsetParent !== null) {
          redoBtn.click();
        }
      }
    },
    'increase_brush': {
      key: ']',
      enabled: true,
      label: '➕ Increase brush size',
      action: function() {
        const slider = document.getElementById('maskBrushSize');
        if (slider && slider.offsetParent !== null) {
          slider.value = Math.min(200, parseInt(slider.value) + 10);
          slider.dispatchEvent(new Event('input'));
        }
      }
    },
    'decrease_brush': {
      key: '[',
      enabled: true,
      label: '➖ Decrease brush size',
      action: function() {
        const slider = document.getElementById('maskBrushSize');
        if (slider && slider.offsetParent !== null) {
          slider.value = Math.max(5, parseInt(slider.value) - 10);
          slider.dispatchEvent(new Event('input'));
        }
      }
    },
    'toggle_invert': {
      key: 'I',
      enabled: true,
      label: '🔄 Toggle mask invert',
      action: function() {
        const invertBtn = document.getElementById('maskInvert');
        if (invertBtn && invertBtn.offsetParent !== null) {
          invertBtn.click();
        }
      }
    },
    'save_mask': {
      key: 'Ctrl+Shift+S',
      enabled: true,
      label: '💾 Save mask',
      action: function() {
        const saveBtn = document.getElementById('maskSave');
        if (saveBtn && saveBtn.offsetParent !== null) {
          saveBtn.click();
        }
      }
    },
    'close_mask': {
      key: 'Escape',
      enabled: true,
      label: '✖️ Close mask editor',
      action: function() {
        const closeBtn = document.getElementById('maskCancel');
        if (closeBtn && closeBtn.offsetParent !== null) {
          closeBtn.click();
        }
      }
    }
  };
  
  // Load saved shortcuts from localStorage
  let shortcuts = {};
  try {
    const saved = localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      // Copy defaults while preserving action functions
      shortcuts = {};
      Object.keys(DEFAULT_SHORTCUTS).forEach(id => {
        shortcuts[id] = {
          key: DEFAULT_SHORTCUTS[id].key,
          enabled: DEFAULT_SHORTCUTS[id].enabled,
          label: DEFAULT_SHORTCUTS[id].label,
          action: DEFAULT_SHORTCUTS[id].action
        };
        // Apply saved values
        if (parsed[id]) {
          if (parsed[id].key) shortcuts[id].key = parsed[id].key;
          if (typeof parsed[id].enabled === 'boolean') shortcuts[id].enabled = parsed[id].enabled;
        }
      });
    } else {
      // Copy defaults
      shortcuts = {};
      Object.keys(DEFAULT_SHORTCUTS).forEach(id => {
        shortcuts[id] = {
          key: DEFAULT_SHORTCUTS[id].key,
          enabled: DEFAULT_SHORTCUTS[id].enabled,
          label: DEFAULT_SHORTCUTS[id].label,
          action: DEFAULT_SHORTCUTS[id].action
        };
      });
    }
  } catch(e) {
    // Fallback to defaults on error
    shortcuts = {};
    Object.keys(DEFAULT_SHORTCUTS).forEach(id => {
      shortcuts[id] = {
        key: DEFAULT_SHORTCUTS[id].key,
        enabled: DEFAULT_SHORTCUTS[id].enabled,
        label: DEFAULT_SHORTCUTS[id].label,
        action: DEFAULT_SHORTCUTS[id].action
      };
    });
  }
  
  // Save shortcuts
  function saveShortcuts() {
    try {
      const toSave = {};
      Object.keys(shortcuts).forEach(id => {
        toSave[id] = {
          key: shortcuts[id].key,
          enabled: shortcuts[id].enabled,
          label: shortcuts[id].label
        };
      });
      localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(toSave));
      console.log('[UI Shortcuts] Shortcuts saved');
    } catch(e) {
      console.error('[UI Shortcuts] Failed to save shortcuts:', e);
    }
  }
  
  // Keyboard handler
  function handleKeyDown(e) {
    // Ignore plain typing in input/textarea
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
      // Only allow modifier-based shortcuts
      if (!e.ctrlKey && !e.altKey && !e.metaKey) {
        return;
      }
    }
    
    const keys = [];
    if (e.ctrlKey) keys.push('Ctrl');
    if (e.shiftKey) keys.push('Shift');
    if (e.altKey) keys.push('Alt');
    if (e.metaKey) keys.push('Meta');
    
    let mainKey = e.key;
    if (mainKey.length === 1) {
      mainKey = mainKey.toUpperCase();
    } else if (mainKey === ' ') {
      mainKey = 'Space';
    }
    
    keys.push(mainKey);
    const combo = keys.join('+');
    
    // Find matching shortcut
    for (const id in shortcuts) {
      const shortcut = shortcuts[id];
      if (shortcut.enabled && shortcut.key === combo) {
        e.preventDefault();
        e.stopPropagation();
        try {
          shortcut.action();
          console.log('[UI Shortcuts] Executed:', shortcut.label);
        } catch(err) {
          console.error('[UI Shortcuts] Shortcut execution error:', err);
        }
        break;
      }
    }
  }
  
  // Settings dialog
  function showSettings() {
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
      z-index: 10001;
      direction: ltr;
    `;
    
    let settingsHTML = '';
    Object.keys(shortcuts).forEach(id => {
      const s = shortcuts[id];
      settingsHTML += `
        <div style="display: flex; gap: 12px; align-items: center; margin-bottom: 12px; padding: 10px; background: #f9f9f9; border-radius: 6px;">
          <label style="display: flex; align-items: center; cursor: pointer;">
            <input type="checkbox" ${s.enabled ? 'checked' : ''} data-id="${id}"
              style="width: 18px; height: 18px; cursor: pointer; margin-right: 8px;">
          </label>
          <div style="flex: 1;">
            <div style="font-weight: 500; color: #333; margin-bottom: 4px;">${s.label}</div>
            <input type="text" value="${s.key}" data-id="${id}" data-type="key"
              style="width: 100%; padding: 6px 10px; border: 1px solid #ddd; border-radius: 4px; font-family: monospace; font-size: 13px;"
              placeholder="Example: Ctrl+Enter">
          </div>
        </div>
      `;
    });
    
    modal.innerHTML = `
      <div style="background: white; border-radius: 12px; padding: 24px; max-width: 650px; width: 90%; max-height: 80vh; overflow-y: auto; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
        <h2 style="margin: 0 0 20px 0; color: #333; display: flex; align-items: center; gap: 10px;">
          ⌨️ UI Shortcuts Settings
        </h2>
        <div style="margin-bottom: 20px; padding: 12px; background: #e3f2fd; border-radius: 6px; font-size: 14px; color: #1976d2;">
          💡 <strong>Tip:</strong> Use Ctrl, Shift, and Alt with keys. Example: Ctrl+Shift+S
        </div>
        <div style="margin-bottom: 20px;">
          ${settingsHTML}
        </div>
        <div style="display: flex; gap: 10px;">
          <button id="save-shortcuts-btn"
            style="flex: 1; background: #10a37f; color: white; border: none; border-radius: 6px; padding: 12px; cursor: pointer; font-size: 15px; font-weight: 600;">
            💾 Save changes
          </button>
          <button id="reset-shortcuts-btn"
            style="background: #ff9800; color: white; border: none; border-radius: 6px; padding: 12px 20px; cursor: pointer; font-size: 14px;">
            🔄 Reset
          </button>
          <button onclick="this.closest('div').parentElement.remove()"
            style="background: #999; color: white; border: none; border-radius: 6px; padding: 12px 20px; cursor: pointer; font-size: 14px;">
            ✖ Cancel
          </button>
        </div>
      </div>
    `;
    
    document.body.appendChild(modal);
    
    // Save changes
    document.getElementById('save-shortcuts-btn').onclick = function() {
      const checkboxes = modal.querySelectorAll('input[type="checkbox"]');
      const keyInputs = modal.querySelectorAll('input[data-type="key"]');
      
      checkboxes.forEach(cb => {
        const id = cb.getAttribute('data-id');
        if (shortcuts[id]) {
          shortcuts[id].enabled = cb.checked;
        }
      });
      
      keyInputs.forEach(input => {
        const id = input.getAttribute('data-id');
        const newKey = input.value.trim();
        if (shortcuts[id] && newKey) {
          shortcuts[id].key = newKey;
        }
      });
      
      saveShortcuts();
      alert('✅ Settings saved successfully!');
      modal.remove();
    };
    
    // Reset to defaults
    document.getElementById('reset-shortcuts-btn').onclick = function() {
      if (confirm('Reset all shortcuts to default settings?')) {
        shortcuts = JSON.parse(JSON.stringify(DEFAULT_SHORTCUTS));
        saveShortcuts();
        alert('✅ Shortcuts reset to defaults!');
        modal.remove();
      }
    };
    
    modal.onclick = (e) => {
      if (e.target === modal) modal.remove();
    };
  }
  
  // Initialize plugin
  function init() {
    document.addEventListener('keydown', handleKeyDown);
    console.log('[UI Shortcuts] Enabled', Object.keys(shortcuts).length, 'shortcuts');
  }
  
  // Register plugin
  if (window.registerPlugin) {
    window.registerPlugin({
      id: 'ui_shortcuts',
      name: 'UI Shortcuts',
      version: '1.0.0',
      onLoad: init,
      onSettings: showSettings
    });
  }
  
  // تشغيل مباشر
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
