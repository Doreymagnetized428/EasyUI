/* Feature #013 — رفع الملفات + قص */

    const _t013 = (key, fallback, params) => {
      try { return window.t ? window.t(key, fallback, params) : fallback; } catch(e) { return fallback; }
    };

    uploadBtn.onclick = () => {
      fileInput.value = '';
      fileInput.click();
    };
    fileInput.onchange = async () => {
      const fileList = [...fileInput.files];
      if (!fileList.length) return;

      const newFiles = await Promise.all(fileList.map(fileToObj));
      files = files.concat(newFiles); // أضف بدلاً من الاستبدال

      renderFilePreviews();

      if (newFiles.length === 1 && newFiles[0].type === 'image') {
        openCropper(newFiles[0].data);
      } else if (newFiles.length === 1 && newFiles[0].type === 'audio' && typeof openAudioTrimmer === 'function') {
        // فتح أداة قص الصوت مباشرة عند رفع ملف صوت واحد
        const idx = files.length - 1;
        openAudioTrimmer(newFiles[0].data, idx);
      }

      updateSend();
    };
    
    function fileToObj(f) {
      return new Promise(r => {
        const fr = new FileReader();
        fr.onload = () => r({
          type: f.type.split('/')[0],
          name: f.name,
          size: f.size,
          data: fr.result
        });
        fr.readAsDataURL(f);
      });
    }
    
    function renderFilePreviews() {
      filePreviews.innerHTML = '';
      
      files.forEach((file, i) => {
        const preview = document.createElement('div');
        preview.className = 'file-preview';
        preview.title = `${file.name} (${formatFileSize(file.size)})`;
        
        if (file.type === 'image') {
          preview.innerHTML = `
            <img src="${file.data}" alt="${file.name}">
            <div class="file-info">${formatFileSize(file.size)}</div>
            <button class="crop-btn" data-index="${i}" title="${_t013('chat.edit', 'تحرير')}">✎</button>
            <button class="remove-btn" data-index="${i}">×</button>
          `;
          // زر فتح أداة القص
          preview.querySelector('.crop-btn').onclick = (e) => {
            e.stopPropagation();
            if (typeof openCropper === 'function') {
              window._cropperFileIndex = i;
              openCropper(file.data);
            }
          };
        } else if (file.type === 'video') {
          preview.innerHTML = `
            <video src="${file.data}" muted></video>
            <div class="file-info">${formatFileSize(file.size)}</div>
            <button class="remove-btn" data-index="${i}">×</button>
          `;
        } else if (file.type === 'audio') {
          preview.innerHTML = `
            <div class="audio-preview"></div>
            <div class="file-info">${formatFileSize(file.size)}</div>
            <button class="crop-btn" data-index="${i}" title="${_t013('chat.edit', 'تحرير')}">✎</button>
            <button class="remove-btn" data-index="${i}">×</button>
          `;
          const trimBtn = preview.querySelector('.crop-btn');
          if (trimBtn) {
            trimBtn.onclick = (e) => {
              e.stopPropagation();
              if (typeof openAudioTrimmer === 'function') {
                openAudioTrimmer(file.data, i);
              }
            };
          }
        }
        
        preview.querySelector('.remove-btn').onclick = (e) => {
          e.stopPropagation();
          files.splice(i, 1);
          renderFilePreviews();
          updateSend();
        };
        
        filePreviews.appendChild(preview);
      });
    }

    // ===== خاصية السحب والإفلات =====
    const composer = document.getElementById('composer');
    
    // منع السلوك الافتراضي للمتصفح
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
      composer.addEventListener(eventName, (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
    });
    
    // تأثير بصري عند السحب
    ['dragenter', 'dragover'].forEach(eventName => {
      composer.addEventListener(eventName, () => {
        composer.classList.add('drag-over');
      });
    });
    
    ['dragleave', 'drop'].forEach(eventName => {
      composer.addEventListener(eventName, () => {
        composer.classList.remove('drag-over');
      });
    });
    
    // معالجة الإفلات
    composer.addEventListener('drop', async (e) => {
      const droppedFiles = [...e.dataTransfer.files];
      if (!droppedFiles.length) return;
      
      // تصفية الملفات المقبولة (صور، فيديو، صوت)
      const validFiles = droppedFiles.filter(f => 
        f.type.startsWith('image/') || 
        f.type.startsWith('video/') || 
        f.type.startsWith('audio/')
      );
      
      if (!validFiles.length) {
        alert(_t013('uploader.only_media_files', 'يرجى سحب ملفات وسائط فقط (صور، فيديو، صوت)'));
        return;
      }
      
      const newFiles = await Promise.all(validFiles.map(fileToObj));
      files = files.concat(newFiles);
      
      renderFilePreviews();
      
      // فتح القص إذا كانت صورة واحدة
      if (newFiles.length === 1 && newFiles[0].type === 'image') {
        openCropper(newFiles[0].data);
      } else if (newFiles.length === 1 && newFiles[0].type === 'audio' && typeof openAudioTrimmer === 'function') {
        const idx = files.length - 1;
        openAudioTrimmer(newFiles[0].data, idx);
      }
      
      updateSend();
    });
    