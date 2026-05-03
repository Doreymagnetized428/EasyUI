/* Feature #036 — My Prompt — تخزين على الخادم */

const _t036 = (key, fallback, params) => {
  try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
};

let customTemplates = [];

document.addEventListener('DOMContentLoaded', () => {
  // تحميل القوالب المحفوظة من الخادم
  loadCustomTemplates();
  
  // أزرار التحكم
  const customTemplatesBtn = document.getElementById('customTemplatesBtn');
  const customTemplatesClose = document.getElementById('customTemplatesClose');
  const customTemplateSaveBtn = document.getElementById('customTemplateSaveBtn');
  const customTemplatesModal = document.getElementById('customTemplatesModal');
  const customTemplateImage = document.getElementById('customTemplateImage');
  const customTemplateText = document.getElementById('customTemplateText');
  
  // أزرار الإضافة
  const addNewPromptBtn = document.getElementById('addNewPromptBtn');
  const cancelAddPromptBtn = document.getElementById('cancelAddPromptBtn');
  const addPromptForm = document.getElementById('addPromptForm');
  
  if (customTemplatesBtn) {
    customTemplatesBtn.addEventListener('click', () => {
      customTemplatesModal.style.display = 'flex';
      // إخفاء form الإضافة عند فتح الـ modal
      addPromptForm.style.display = 'none';
      loadCustomTemplates();
    });
  }
  
  if (customTemplatesClose) {
    customTemplatesClose.addEventListener('click', () => {
      customTemplatesModal.style.display = 'none';
      addPromptForm.style.display = 'none';
    });
  }
  
  // إظهار form الإضافة عند الضغط على زر Add New Prompt
  if (addNewPromptBtn) {
    addNewPromptBtn.addEventListener('click', () => {
      addPromptForm.style.display = 'flex';
      addNewPromptBtn.style.display = 'none';
    });
  }
  
  // إخفاء form الإضافة عند الضغط على Cancel
  if (cancelAddPromptBtn) {
    cancelAddPromptBtn.addEventListener('click', () => {
      addPromptForm.style.display = 'none';
      addNewPromptBtn.style.display = 'block';
      // مسح المدخلات
      customTemplateImage.value = '';
      customTemplateText.value = '';
    });
  }
  
  if (customTemplateSaveBtn) {
    customTemplateSaveBtn.addEventListener('click', saveNewTemplate);
  }
  
  // إغلاق عند الضغط خارج النافذة
  if (customTemplatesModal) {
    customTemplatesModal.addEventListener('click', (e) => {
      if (e.target === customTemplatesModal) {
        customTemplatesModal.style.display = 'none';
        addPromptForm.style.display = 'none';
      }
    });
  }
});

async function loadCustomTemplates() {
  const username = (document.getElementById('usernameInput') && document.getElementById('usernameInput').value.trim()) || 'guest';
  const uiLanguage = (typeof window.getLanguage === 'function' ? window.getLanguage() : (localStorage.getItem('ui_lang') || 'ar'));
  try {
    const response = await fetch('/api/my_prompt/list', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, ui_language: uiLanguage })
    });
    const data = await response.json();
    customTemplates = data.templates || [];
    renderCustomTemplates();
  } catch (e) {
    console.error('فشل تحميل القوالب:', e);
    customTemplates = [];
  }
}

async function saveNewTemplate() {
  const imageInput = document.getElementById('customTemplateImage');
  const textInput = document.getElementById('customTemplateText');
  const username = (document.getElementById('usernameInput') && document.getElementById('usernameInput').value.trim()) || 'guest';
  const uiLanguage = (typeof window.getLanguage === 'function' ? window.getLanguage() : (localStorage.getItem('ui_lang') || 'ar'));
  
  if (!imageInput.files || !imageInput.files[0]) {
    alert(_t036('my_prompt.pick_image', 'يرجى اختيار صورة'));
    return;
  }
  
  if (!textInput.value.trim()) {
    alert(_t036('my_prompt.enter_text_or_command', 'يرجى كتابة النص أو الأمر'));
    return;
  }
  
  const file = imageInput.files[0];
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    try {
      const response = await fetch('/api/my_prompt/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          ui_language: uiLanguage,
          image: e.target.result, // base64
          text: textInput.value.trim()
        })
      });
      
      const data = await response.json();
      
      if (data.success) {
        // مسح المدخلات
        imageInput.value = '';
        textInput.value = '';
        
        // إخفاء form الإضافة
        document.getElementById('addPromptForm').style.display = 'none';
        document.getElementById('addNewPromptBtn').style.display = 'block';
        
        // تحديث القائمة
        await loadCustomTemplates();
        alert(_t036('my_prompt.saved_ok', 'تم حفظ Prompt بنجاح'));
      } else {
        alert(_t036('my_prompt.save_failed_with_error', 'فشل حفظ القالب: {error}', { error: (data.error || _t036('errors.unknown', 'خطأ غير معروف')) }));
      }
    } catch (error) {
      console.error('خطأ في حفظ القالب:', error);
      alert(_t036('my_prompt.save_failed', 'فشل حفظ القالب'));
    }
  };
  
  reader.readAsDataURL(file);
}

function renderCustomTemplates() {
  const container = document.getElementById('customTemplatesList');
  container.innerHTML = '';
  
  const username = (document.getElementById('usernameInput') && document.getElementById('usernameInput').value.trim()) || 'guest';
  const uiLanguage = (typeof window.getLanguage === 'function' ? window.getLanguage() : (localStorage.getItem('ui_lang') || 'ar'));
  
  customTemplates.forEach((template, index) => {
    const item = document.createElement('div');
    item.style.cssText = `
      border: 1px solid #ddd;
      border-radius: 8px;
      background: #f9f9f9;
      padding: 4px;
      cursor: pointer;
      position: relative;
      transition: all 0.2s;
    `;
    item.onmouseover = () => {
      item.style.borderColor = '#10a37f';
      item.style.boxShadow = '0 0 0 2px #10a37f44';
    };
    item.onmouseout = () => {
      item.style.borderColor = '#ddd';
      item.style.boxShadow = 'none';
    };
    
    const img = document.createElement('img');
    img.src = `/api/my_prompt/image/${template.id}?username=${encodeURIComponent(username)}`;
    img.style.cssText = `
      width: 100%;
      aspect-ratio: 1/1;
      object-fit: cover;
      border-radius: 6px;
      display: block;
      cursor: pointer;
    `;
    img.onerror = () => {
      img.style.background = '#ddd';
      img.textContent = '❌';
    };
    
    const label = document.createElement('div');
    label.textContent = template.text;
    label.style.cssText = `
      font-size: 10px;
      text-align: center;
      margin-top: 2px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      padding: 2px 2px;
    `;
    
    // زر الحذف
    const deleteBtn = document.createElement('button');
    deleteBtn.textContent = '×';
    deleteBtn.style.cssText = `
      position: absolute;
      top: 0;
      right: 0;
      width: 20px;
      height: 20px;
      border-radius: 50%;
      background: #f44336;
      color: #fff;
      border: none;
      font-size: 12px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `;
    deleteBtn.onclick = async (e) => {
      e.stopPropagation();
      if (confirm(_t036('my_prompt.confirm_delete', 'هل تريد حذف هذا القالب؟'))) {
        try {
          const response = await fetch('/api/my_prompt/delete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ template_id: template.id, username, ui_language: uiLanguage })
          });
          const data = await response.json();
          if (data.success) {
            await loadCustomTemplates();
          } else {
            alert(_t036('my_prompt.delete_failed', 'فشل الحذف'));
          }
        } catch (error) {
          console.error('خطأ في حذف القالب:', error);
          alert(_t036('my_prompt.delete_failed', 'فشل الحذف'));
        }
      }
    };
    
    // عند النقر على الصورة: إضافة النص فقط (بدون الصورة)
    img.onclick = async () => {
      // إضافة الأمر (نص) للـ input فقط
      const mainInput = document.getElementById('mainInput');
      if (mainInput) {
        mainInput.value = template.text + '\n';
        mainInput.focus();
        
        // إرسال أحداث لإخطار الـ send function بالتحديث
        mainInput.dispatchEvent(new Event('input', { bubbles: true }));
        mainInput.dispatchEvent(new Event('change', { bubbles: true }));
      }
      
      // إغلاق النافذة
      document.getElementById('customTemplatesModal').style.display = 'none';
    };
    
    item.appendChild(img);
    item.appendChild(label);
    item.appendChild(deleteBtn);
    container.appendChild(item);
  });
}



// تحديث القوالب عند تغيير المستخدم
document.addEventListener('DOMContentLoaded', () => {
  const saveSettingsBtn = document.getElementById('saveSettingsBtn');
  if (saveSettingsBtn) {
    const originalOnclick = saveSettingsBtn.onclick;
    saveSettingsBtn.onclick = function() {
      if (originalOnclick) originalOnclick.call(this);
      loadCustomTemplates();
    };
  }
});
