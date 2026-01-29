document.addEventListener('DOMContentLoaded', () => {
    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');
    const historyList = document.getElementById('history-list');
    const selectAllCheckbox = document.getElementById('select-all');
    const bulkActions = document.getElementById('bulk-actions');
    const bulkPrintBtn = document.getElementById('bulk-print');
    const bulkDeleteBtn = document.getElementById('bulk-delete');

    const stagedFilesContainer = document.getElementById('staged-files-container');
    const stagedCountText = document.getElementById('staged-count');
    const batchNameInput = document.getElementById('batch-name-input');
    const uploadBtn = document.getElementById('upload-btn');
    const selectedCounter = document.getElementById('selected-counter');

    // Add a place for the staged list again since the user might be confused if nothing shows
    let stagedList = document.getElementById('staged-list');
    if (!stagedList && stagedFilesContainer) {
        stagedList = document.createElement('div');
        stagedList.id = 'staged-list';
        stagedList.style.cssText = 'max-height: 150px; overflow-y: auto; margin-top: 10px; font-size: 12px; color: var(--text-muted); padding: 5px; border-top: 1px solid rgba(255,255,255,0.05);';
        stagedFilesContainer.querySelector('div').after(stagedList);
    }

    // For Batch Filtering
    const historyHeader = document.querySelector('.history-header');
    let batchFilterContainer = document.getElementById('batch-filter-container');

    if (!batchFilterContainer) {
        batchFilterContainer = document.createElement('div');
        batchFilterContainer.id = 'batch-filter-container';
        batchFilterContainer.style.cssText = 'margin-bottom: 20px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 10px; background: rgba(255,255,255,0.02); border-radius: 12px; border: 1px solid var(--glass-border);';
        historyHeader.after(batchFilterContainer);
    }

    const progressContainer = document.getElementById('print-progress');
    const progressBar = document.getElementById('progress-bar');
    const progressText = document.getElementById('progress-text');

    // Dynamic Server URL
    // If opened as a file, use localhost. If hosted (GitHub Pages/Ngrok), use the specific Ngrok URL.
    const serverUrl = window.location.protocol === 'file:'
        ? 'http://localhost:3001'
        : 'https://nonencyclopedical-unsomberly-casimira.ngrok-free.dev';
    let uploadedFiles = [];
    let stagedFiles = [];
    let isLoading = true;
    let currentCategory = 'All';

    // Headers (Skip ngrok warning)
    const headers = {
        'ngrok-skip-browser-warning': 'true'
    };

    // Load history from SERVER (Shared across all laptops)
    async function fetchHistory() {
        try {
            const response = await fetch(`${serverUrl}/history`, { headers });
            uploadedFiles = await response.json();
            isLoading = false;
            renderBatchFilters();
            renderHistory();
        } catch (e) {
            console.error('Failed to fetch shared history');
            isLoading = false;
            renderHistory();
        }
    }

    // Refresh history every 7 seconds
    setInterval(fetchHistory, 7000);
    fetchHistory();

    if (uploadArea) {
        uploadArea.addEventListener('click', () => fileInput.click());
        uploadArea.addEventListener('dragover', (e) => { e.preventDefault(); uploadArea.style.borderColor = 'var(--primary)'; });
        uploadArea.addEventListener('dragleave', () => { uploadArea.style.borderColor = 'var(--glass-border)'; });
        uploadArea.addEventListener('drop', (e) => { e.preventDefault(); handleFiles(e.dataTransfer.files); });
        fileInput.addEventListener('change', (e) => { handleFiles(e.target.files); });
    }

    function handleFiles(files) {
        const fileList = Array.from(files);
        for (const file of fileList) {
            if (file.type === 'application/pdf') {
                stagedFiles.push(file);
            }
        }
        renderStagedFiles();
    }

    function renderStagedFiles() {
        if (!stagedFilesContainer) return;
        if (stagedFiles.length === 0) {
            stagedFilesContainer.style.display = 'none';
            return;
        }

        stagedFilesContainer.style.display = 'block';
        stagedCountText.innerText = `${stagedFiles.length} PDF(s) to Upload`;

        if (stagedList) {
            stagedList.innerHTML = stagedFiles.slice(0, 10).map(f => `<div>• ${f.name}</div>`).join('');
            if (stagedFiles.length > 10) stagedList.innerHTML += `<div>...and ${stagedFiles.length - 10} more.</div>`;
        }
    }

    if (uploadBtn) {
        uploadBtn.addEventListener('click', async () => {
            const total = stagedFiles.length;
            const batchName = batchNameInput.value.trim() || `Batch ${new Date().toLocaleTimeString()}`;

            if (total === 0) return;

            uploadBtn.disabled = true;
            uploadBtn.innerText = 'Uploading 0%';

            for (let i = 0; i < stagedFiles.length; i++) {
                const percent = Math.round((i / total) * 100);
                uploadBtn.innerText = `Uploading ${percent}%`;
                await uploadFile(stagedFiles[i], batchName);
            }

            stagedFiles = [];
            batchNameInput.value = '';
            renderStagedFiles();
            uploadBtn.disabled = false;
            uploadBtn.innerText = 'Upload All as Batch';
            alert(`Success! ${total} labels uploaded to: ${batchName}`);
            await fetchHistory(); // Refresh immediately
        });
    }

    async function uploadFile(file, batchName) {
        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('batchName', batchName);
        try {
            const response = await fetch(`${serverUrl}/upload`, {
                method: 'POST',
                body: formData,
                headers: headers
            });
            if (!response.ok) throw new Error('Upload failed');
        } catch (error) {
            console.error('Upload failed', error);
            alert(`Upload failed for ${file.name}. Is the server running?`);
        }
    }

    function renderBatchFilters() {
        if (!batchFilterContainer) return;

        // Get unique batch names
        const batches = ['All'];
        const uniqueBatches = [...new Set(uploadedFiles.map(f => f.batchName || 'Default Batch'))];
        batches.push(...uniqueBatches.reverse());

        batchFilterContainer.innerHTML = '<span style="font-size: 13px; font-weight: 600; color: var(--text-muted); margin-right: 5px;">Filter:</span>';

        batches.forEach(batch => {
            const btn = document.createElement('button');
            btn.className = 'print-btn';
            const isActive = currentCategory === batch;
            btn.style.cssText = `padding: 5px 15px; font-size: 12px; border-radius: 20px; transition: all 0.3s; 
                ${isActive ? 'background: var(--primary); border-color: var(--primary); transform: scale(1.05);' : 'background: rgba(255,255,255,0.05); border-color: var(--glass-border); opacity: 0.7;'}`;
            btn.innerText = batch;
            btn.onclick = () => {
                currentCategory = batch;
                renderBatchFilters();
                renderHistory();
            };
            batchFilterContainer.appendChild(btn);
        });

        if (currentCategory !== 'All') {
            const actionsDiv = document.createElement('div');
            actionsDiv.style.cssText = 'margin-left: auto; display: flex; gap: 8px;';

            const printAllBtn = document.createElement('button');
            printAllBtn.className = 'print-btn';
            printAllBtn.style.cssText = 'padding: 5px 15px; font-size: 12px; background: rgba(16, 185, 129, 0.2); color: #10b981; border-color: #10b981; font-weight: 600;';
            printAllBtn.innerText = `Print All ${currentCategory}`;
            printAllBtn.onclick = () => printBatch(currentCategory);

            const deleteBatchBtn = document.createElement('button');
            deleteBatchBtn.className = 'print-btn';
            deleteBatchBtn.style.cssText = 'padding: 5px 15px; font-size: 12px; background: rgba(239, 68, 68, 0.2); color: #ef4444; border-color: #ef4444; font-weight: 600;';
            deleteBatchBtn.innerText = `Delete ${currentCategory}`;
            deleteBatchBtn.onclick = async () => {
                const filesToDelete = uploadedFiles.filter(f => (f.batchName || 'Default Batch') === currentCategory);
                if (confirm(`Are you sure you want to delete the entire group "${currentCategory}"? (${filesToDelete.length} files will be deleted)`)) {
                    const filenames = filesToDelete.map(f => f.filename);
                    try {
                        await fetch(`${serverUrl}/delete-history`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', ...headers },
                            body: JSON.stringify({ filenames })
                        });
                        currentCategory = 'All'; // Back to All after delete
                        await fetchHistory();
                    } catch (e) { console.error('Delete batch failed'); }
                }
            };

            actionsDiv.appendChild(printAllBtn);
            actionsDiv.appendChild(deleteBatchBtn);
            batchFilterContainer.appendChild(actionsDiv);
        }
    }

    function renderHistory() {
        if (!historyList) return;

        if (isLoading) {
            historyList.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 100px;"><p>Syncing history from server...</p></div>';
            return;
        }

        const filteredFiles = currentCategory === 'All'
            ? uploadedFiles
            : uploadedFiles.filter(f => (f.batchName || 'Default Batch') === currentCategory);

        if (filteredFiles.length === 0) {
            historyList.innerHTML = '<div style="text-align: center; color: var(--text-muted); margin-top: 100px;"><p>No files in this category.</p></div>';
            if (bulkActions) bulkActions.style.display = 'none';
            if (selectedCounter) selectedCounter.innerText = '';
            return;
        }

        historyList.innerHTML = '';
        filteredFiles.slice().reverse().forEach(file => {
            const row = document.createElement('div');
            row.className = 'history-item';
            row.dataset.filename = file.filename;

            const skuBadge = file.sku ? `<span class="sku-badge">${file.sku}</span>` : '';
            const bTag = currentCategory === 'All' ? `<span style="font-size: 10px; color: var(--primary); background: rgba(99,102,241,0.1); padding: 2px 6px; border-radius: 4px; margin-right: 5px;">${file.batchName || 'Default'}</span>` : '';

            row.innerHTML = `
                <div class="file-info">
                    <input type="checkbox" class="file-checkbox custom-checkbox">
                    <div class="file-icon" style="width: 34px; height: 34px; font-size: 8px;">PDF</div>
                    <div style="overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1;">
                        <div style="display: flex; align-items: center; gap: 8px;">
                            <div class="file-name" style="font-size: 14px;">${file.originalname}</div>
                            ${skuBadge}
                        </div>
                        <div class="file-meta" style="font-size: 11px;">
                            ${bTag} ${(file.size / 1024).toFixed(1)} KB
                        </div>
                    </div>
                </div>
                <button class="print-btn" style="padding: 6px 14px; font-size: 12px;" onclick="silentPrint('${file.filename}', this)">Print</button>
            `;

            row.addEventListener('click', (e) => {
                if (e.target.tagName !== 'BUTTON' && e.target.tagName !== 'INPUT') {
                    const cb = row.querySelector('.file-checkbox');
                    cb.checked = !cb.checked;
                    toggleRowSelected(row, cb.checked);
                }
            });

            row.querySelector('.file-checkbox').addEventListener('change', (e) => {
                toggleRowSelected(row, e.target.checked);
            });

            historyList.appendChild(row);
        });

        updateBulkVisibility();
    }

    function toggleRowSelected(row, isChecked) {
        isChecked ? row.classList.add('selected') : row.classList.remove('selected');
        updateBulkVisibility();
    }

    function updateBulkVisibility() {
        if (!historyList || !bulkActions) return;
        const checked = document.querySelectorAll('.file-checkbox:checked').length;
        bulkActions.style.display = checked > 0 ? 'flex' : 'none';

        if (selectedCounter) {
            selectedCounter.innerText = checked > 0 ? `(${checked} Selected)` : '';
        }
    }

    window.printBatch = async (bName) => {
        const files = uploadedFiles.filter(f => (f.batchName || 'Default Batch') === bName);
        const total = files.length;

        if (!confirm(`Print all ${total} labels from "${bName}"?`)) return;
        if (progressContainer) progressContainer.style.display = 'flex';

        for (let i = 0; i < total; i++) {
            if (progressBar) progressBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
            if (progressText) progressText.innerText = `${i + 1} / ${total}`;

            try {
                await fetch(`${serverUrl}/print`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify({ filename: files[i].filename })
                });
                await fetchHistory();
                await new Promise(r => setTimeout(r, 600));
            } catch (e) { console.error('Print error'); }
        }

        setTimeout(() => {
            if (progressContainer) progressContainer.style.display = 'none';
            alert(`Done! ${total} labels sent to printer.`);
        }, 1000);
    };

    if (selectAllCheckbox) {
        selectAllCheckbox.addEventListener('change', (e) => {
            const isChecked = e.target.checked;
            document.querySelectorAll('.file-checkbox').forEach(cb => {
                cb.checked = isChecked;
                const row = cb.closest('.history-item');
                if (row) isChecked ? row.classList.add('selected') : row.classList.remove('selected');
            });
            updateBulkVisibility();
        });
    }

    if (bulkDeleteBtn) {
        bulkDeleteBtn.addEventListener('click', async () => {
            const checkedRows = document.querySelectorAll('.history-item.selected');
            const filenames = Array.from(checkedRows).map(row => row.dataset.filename);

            if (!confirm(`Are you sure you want to delete ${filenames.length} selected files?`)) return;

            try {
                await fetch(`${serverUrl}/delete-history`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', ...headers },
                    body: JSON.stringify({ filenames })
                });
                await fetchHistory();
            } catch (e) { console.error('Delete failed'); }
        });
    }

    if (bulkPrintBtn) {
        bulkPrintBtn.addEventListener('click', async () => {
            const checkedRows = document.querySelectorAll('.history-item.selected');
            const filenames = Array.from(checkedRows).map(row => row.dataset.filename);
            const total = filenames.length;

            bulkPrintBtn.disabled = true;
            if (progressContainer) progressContainer.style.display = 'flex';

            for (let i = 0; i < total; i++) {
                if (progressBar) progressBar.style.width = Math.round(((i + 1) / total) * 100) + '%';
                if (progressText) progressText.innerText = `${i + 1} / ${total}`;

                try {
                    await fetch(`${serverUrl}/print`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...headers },
                        body: JSON.stringify({ filename: filenames[i] })
                    });
                    await fetchHistory();
                    await new Promise(r => setTimeout(r, 600));
                } catch (e) { console.error('Print error'); }
            }

            setTimeout(() => {
                if (progressContainer) progressContainer.style.display = 'none';
                bulkPrintBtn.disabled = false;
                alert(`Sent ${total} labels to TSC Printer!`);
            }, 1000);
        });
    }

    window.silentPrint = async (filename, btn) => {
        btn.disabled = true; btn.innerHTML = 'Wait...';
        try {
            await fetch(`${serverUrl}/print`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...headers },
                body: JSON.stringify({ filename })
            });
            await fetchHistory();
            btn.innerHTML = 'Done';
            setTimeout(() => { btn.innerHTML = 'Print'; btn.disabled = false; }, 1500);
        } catch (e) { alert('Print failed'); btn.disabled = false; btn.innerHTML = 'Print'; }
    };
});
