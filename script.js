document.addEventListener('DOMContentLoaded', () => {

    // --- Safe Storage Helpers ---
    const getStorageItem = (key) => {
        try {
            return localStorage.getItem(key);
        } catch (e) {
            console.warn("Storage access error:", e);
            return null;
        }
    };
    const setStorageItem = (key, value) => {
        try {
            localStorage.setItem(key, value);
        } catch (e) {
            console.warn("Storage access error:", e);
        }
    };

    // --- Cryptography Helpers for Invitation Locking ---
    const BACKEND_URL = "https://script.google.com/macros/s/AKfycbzMrIRo-1w32iPpm64JhNgU4xCFYrmVzsKfUozAZ-tKbbkIW5OrxylvK7Map3sLtbMmMg/exec";
    const SECRET_PASSPHRASE = "Rafa30CasinoRoyale2026!"; // Secret key for AES-CBC

    const str2ab = (str) => new TextEncoder().encode(str);
    const ab2str = (buf) => new TextDecoder().decode(buf);

    const hexToBuf = (hex) => {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes.buffer;
    };

    const bufToHex = (buf) => {
        return Array.from(new Uint8Array(buf))
            .map(b => b.toString(16).padStart(2, '0'))
            .join('');
    };

    async function deriveKey() {
        const msgUint8 = str2ab(SECRET_PASSPHRASE);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
        return await crypto.subtle.importKey(
            'raw',
            hashBuffer,
            { name: 'AES-CBC' },
            false,
            ['encrypt', 'decrypt']
        );
    }

    async function encryptInvite(dataObj) {
        try {
            const dataText = JSON.stringify(dataObj);
            const key = await deriveKey();
            const iv = crypto.getRandomValues(new Uint8Array(16));
            const encrypted = await crypto.subtle.encrypt(
                { name: 'AES-CBC', iv: iv },
                key,
                str2ab(dataText)
            );
            return bufToHex(iv.buffer) + "_" + bufToHex(encrypted);
        } catch (e) {
            console.error("Encryption failed:", e);
            return null;
        }
    }

    async function decryptInvite(token) {
        try {
            const parts = token.split('_');
            if (parts.length !== 2) return null;
            const ivBuf = hexToBuf(parts[0]);
            const ciphertextBuf = hexToBuf(parts[1]);
            const key = await deriveKey();
            const decrypted = await crypto.subtle.decrypt(
                { name: 'AES-CBC', iv: new Uint8Array(ivBuf) },
                key,
                ciphertextBuf
            );
            return JSON.parse(ab2str(decrypted));
        } catch (e) {
            console.error("Decryption failed:", e);
            return null;
        }
    }

    // --- Access Control / Routing Views ---
    const showAccessDenied = (msg) => {
        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');
        const landingOverlay = document.getElementById('landing-overlay');
        const deniedOverlay = document.getElementById('denied-overlay');
        const deniedMessage = document.getElementById('denied-message');
        const mainContent = document.getElementById('main-content');

        if (landingOverlay) landingOverlay.classList.add('hidden');
        if (mainContent) mainContent.classList.add('hidden');
        if (deniedOverlay) deniedOverlay.classList.remove('hidden');
        if (deniedMessage) deniedMessage.innerText = msg;
    };

    const setupGuestInvitation = (guestData) => {
        const urlParams = new URLSearchParams(window.location.search);
        const passToken = urlParams.get('pass');
        const rsvpStatus = passToken ? getStorageItem('rsvp_status_' + passToken) : null;

        const landingOverlay = document.getElementById('landing-overlay');
        const mainContent = document.getElementById('main-content');
        const rsvpForm = document.getElementById('rsvp-form');
        const rsvpMessage = document.getElementById('rsvp-message');
        const rsvpDeclineMessage = document.getElementById('rsvp-decline-message');

        // Check if already responded
        if (rsvpStatus && rsvpForm) {
            triggerMainReveal(true);
            rsvpForm.style.display = 'none';

            if (rsvpStatus === 'confirmed') {
                if (rsvpMessage) rsvpMessage.style.display = 'block';
                const countEl = document.getElementById('pass-count-text');
                const passText = getStorageItem('rsvp_pass_text_' + passToken) || "1 PASE";
                if (countEl) countEl.innerText = "ACCESO AUTORIZADO: " + passText;
            } else if (rsvpStatus === 'declined') {
                if (rsvpDeclineMessage) rsvpDeclineMessage.style.display = 'block';
            }
        }

        const greetingEl = document.getElementById('card-invite-greeting');
        if (greetingEl) {
            greetingEl.innerHTML = `Te invita, <strong style="color: var(--gold);">${guestData.name}</strong>, a celebrar su fiesta de`;
        }

        const rsvpNameInput = document.getElementById('rsvp-name');
        if (rsvpNameInput) {
            rsvpNameInput.value = guestData.name;
            rsvpNameInput.readOnly = true;
            rsvpNameInput.style.opacity = '0.75';
            rsvpNameInput.style.cursor = 'not-allowed';
        }

        const rsvpGuestsSelect = document.getElementById('rsvp-guests');
        if (rsvpGuestsSelect) {
            rsvpGuestsSelect.innerHTML = '';
            const maxPasses = parseInt(guestData.passes, 10) || 1;
            for (let i = 1; i <= maxPasses; i++) {
                const opt = document.createElement('option');
                opt.value = (i - 1).toString();
                if (i === 1) {
                    opt.textContent = `Solo Yo (1 pase)`;
                } else {
                    opt.textContent = `${i - 1} Acompañante${i > 2 ? 's' : ''} (${i} pases)`;
                }
                rsvpGuestsSelect.appendChild(opt);
            }
        }

    };

    // --- Toast Notification System ---
    const showToast = (message, type = 'success') => {
        let container = document.getElementById('admin-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'admin-toast-container';
            document.body.appendChild(container);
        }
        const toast = document.createElement('div');
        toast.className = `admin-toast${type === 'error' ? ' toast-error' : ''}`;
        toast.innerText = message;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-exit');
            toast.addEventListener('animationend', () => toast.remove());
        }, 3500);
    };

    // --- IndexedDB Cache Helper for Admin Invites ---
    const DB_NAME = 'CasinoRoyaleDB';
    const STORE_NAME = 'admin_invites';
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(DB_NAME, DB_VERSION);
            request.onerror = (e) => reject(e.target.error);
            request.onsuccess = (e) => resolve(e.target.result);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(STORE_NAME)) {
                    db.createObjectStore(STORE_NAME);
                }
            };
        });
    }

    async function getCachedInvites() {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readonly');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.get('list');
                request.onsuccess = (e) => resolve(e.target.result || null);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.error("IndexedDB read error:", err);
            return null;
        }
    }

    async function saveCachedInvites(invites) {
        try {
            const db = await openDB();
            return new Promise((resolve, reject) => {
                const transaction = db.transaction(STORE_NAME, 'readwrite');
                const store = transaction.objectStore(STORE_NAME);
                const request = store.put(invites, 'list');
                request.onsuccess = () => resolve(true);
                request.onerror = (e) => reject(e.target.error);
            });
        } catch (err) {
            console.error("IndexedDB write error:", err);
            return false;
        }
    }

    const initAdminLogic = () => {
        const adminPassInput = document.getElementById('admin-pass');
        const adminLoginBtn = document.getElementById('admin-login-btn');
        const adminLoginError = document.getElementById('admin-login-error');
        const adminLoginGroup = document.getElementById('admin-login-group');
        const adminGeneratorGroup = document.getElementById('admin-generator-group');

        const editModal = document.getElementById('edit-modal');
        const editOldName = document.getElementById('edit-old-name');
        const editGuestName = document.getElementById('edit-guest-name');
        const editPasses = document.getElementById('edit-passes');
        const editStatus = document.getElementById('edit-status');
        const editConfirmedPasses = document.getElementById('edit-confirmed-passes');
        const editCancelBtn = document.getElementById('edit-cancel-btn');
        const editSaveBtn = document.getElementById('edit-save-btn');

        let allInvites = [];
        let currentPage = 1;
        const recordsPerPage = 8;
        const selectedGuests = new Set();

        const updateBulkShareButtonState = () => {
            const bulkBtn = document.getElementById('admin-bulk-share-btn');
            const countSpan = document.getElementById('admin-selected-count');
            const selectAllCb = document.getElementById('admin-select-all');
            const tbody = document.getElementById('admin-table-body');

            if (bulkBtn && countSpan) {
                const count = selectedGuests.size;
                countSpan.innerText = count;
                if (count > 0) {
                    bulkBtn.style.setProperty('display', 'inline-flex', 'important');
                } else {
                    bulkBtn.style.setProperty('display', 'none', 'important');
                }
            }

            if (selectAllCb && tbody) {
                const visibleCheckboxes = tbody.querySelectorAll('.admin-row-checkbox');
                if (visibleCheckboxes.length > 0) {
                    const allChecked = Array.from(visibleCheckboxes).every(cb => cb.checked);
                    selectAllCb.checked = allChecked;
                } else {
                    selectAllCb.checked = false;
                }
            }
        };

        const loadInvites = async () => {
            const tbody = document.getElementById('admin-table-body');
            if (!tbody) return;

            // Try to load from IndexedDB first for instant display
            const cachedInvites = await getCachedInvites();
            if (cachedInvites && Array.isArray(cachedInvites)) {
                allInvites = cachedInvites;
                renderTable();
            } else {
                tbody.innerHTML = '<tr><td colspan="4" class="admin-td-empty">Cargando invitaciones...</td></tr>';
            }

            try {
                const response = await fetch(BACKEND_URL, {
                    method: 'POST',
                    body: JSON.stringify({ action: "get-invites" })
                });
                const resData = await response.json();

                if (resData.status === "success" && resData.invites) {
                    allInvites = resData.invites;
                    await saveCachedInvites(allInvites);
                    renderTable();
                } else {
                    if (!cachedInvites) {
                        tbody.innerHTML = '<tr><td colspan="4" class="admin-td-empty" style="color:#ff5050;">Error al cargar invitaciones.</td></tr>';
                    }
                    showToast("Error al sincronizar con el servidor.", "error");
                }
            } catch (err) {
                console.error("Error loading invites:", err);
                if (!cachedInvites) {
                    tbody.innerHTML = '<tr><td colspan="4" class="admin-td-empty" style="color:#ff5050;">Fallo de conexión.</td></tr>';
                }
                showToast("Fallo de conexión con el servidor.", "error");
            }
        };

        const renderTable = async () => {
            const tbody = document.getElementById('admin-table-body');
            if (!tbody) return;

            const searchInput = document.getElementById('admin-search');
            const filterSelect = document.getElementById('admin-filter-status');
            const searchValue = searchInput ? searchInput.value.toLowerCase().trim() : '';
            const filterValue = filterSelect ? filterSelect.value : 'todos';

            const filteredInvites = allInvites.filter(invite => {
                const matchesSearch = invite.name.toLowerCase().includes(searchValue);
                const matchesStatus = filterValue === 'todos' || invite.status === filterValue;
                return matchesSearch && matchesStatus;
            });

            const totalRecords = filteredInvites.length;
            const totalPages = Math.ceil(totalRecords / recordsPerPage) || 1;
            if (currentPage > totalPages) currentPage = totalPages;
            if (currentPage < 1) currentPage = 1;

            const startIndex = (currentPage - 1) * recordsPerPage;
            const endIndex = Math.min(startIndex + recordsPerPage, totalRecords);
            const pageRecords = filteredInvites.slice(startIndex, endIndex);

            const paginationInfo = document.getElementById('admin-pagination-info');
            if (paginationInfo) {
                paginationInfo.innerText = totalRecords === 0
                    ? "Mostrando 0 de 0"
                    : `Mostrando ${startIndex + 1}–${endIndex} de ${totalRecords}`;
            }

            const prevBtn = document.getElementById('admin-page-prev');
            const nextBtn = document.getElementById('admin-page-next');
            if (prevBtn) prevBtn.disabled = currentPage === 1;
            if (nextBtn) nextBtn.disabled = currentPage === totalPages;

            tbody.innerHTML = '';
            if (pageRecords.length === 0) {
                tbody.innerHTML = '<tr><td colspan="5" class="admin-td-empty">No se encontraron invitaciones.</td></tr>';
                updateStats();
                return;
            }

            for (const invite of pageRecords) {
                const tr = document.createElement('tr');

                let statusStyle = '';
                if (invite.status === 'Confirmado') {
                    statusStyle = 'color:#4cd137;background:rgba(76,209,55,0.12);border:1px solid rgba(76,209,55,0.4);';
                } else if (invite.status === 'Declinado') {
                    statusStyle = 'color:#e84118;background:rgba(232,65,24,0.12);border:1px solid rgba(232,65,24,0.4);';
                } else {
                    statusStyle = 'color:#ffd700;background:rgba(255,215,0,0.1);border:1px solid rgba(255,215,0,0.3);';
                }

                const token = await encryptInvite({ name: invite.name, passes: parseInt(invite.max_passes, 10) });
                const inviteUrl = window.location.origin + window.location.pathname + "?pass=" + token;

                const isChecked = selectedGuests.has(invite.name) ? 'checked' : '';
                tr.innerHTML = `
                    <td style="text-align: center; padding: 0.9rem 0.5rem;">
                        <input type="checkbox" class="admin-row-checkbox" data-name="${invite.name}" ${isChecked} style="cursor: pointer; transform: scale(1.15);">
                    </td>
                    <td><strong style="color:#fff;">${invite.name}</strong></td>
                    <td style="color:#bbb;font-size:0.88rem;">${invite.confirmed_passes} / ${invite.max_passes}</td>
                    <td>
                        <span class="admin-badge" style="${statusStyle}">${invite.status}</span>
                    </td>
                    <td style="text-align:center;">
                        <div style="display:flex;gap:0.4rem;justify-content:center;align-items:center;">
                            <button class="admin-action-btn admin-action-copy" title="Copiar enlace">📋</button>
                            <button class="admin-action-btn admin-action-edit" title="Editar">✏️</button>
                            <button class="admin-action-btn admin-action-delete" title="Eliminar">🗑️</button>
                        </div>
                    </td>
                `;

                tr.querySelector('.admin-row-checkbox').addEventListener('change', (e) => {
                    if (e.target.checked) {
                        selectedGuests.add(invite.name);
                    } else {
                        selectedGuests.delete(invite.name);
                    }
                    updateBulkShareButtonState();
                });

                tr.querySelector('.admin-action-copy').addEventListener('click', (e) => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(inviteUrl).then(() => {
                        showToast(`📋 Enlace copiado para ${invite.name}`);
                    });
                });

                tr.querySelector('.admin-action-edit').addEventListener('click', (e) => {
                    e.stopPropagation();
                    openEditModal(invite);
                });

                tr.querySelector('.admin-action-delete').addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`¿Eliminar la invitación de "${invite.name}"?`)) {
                        const backupInvites = [...allInvites];
                        allInvites = allInvites.filter(i => i.name.toLowerCase() !== invite.name.toLowerCase());
                        selectedGuests.delete(invite.name);
                        await saveCachedInvites(allInvites);
                        renderTable();

                        try {
                            const response = await fetch(BACKEND_URL, {
                                method: 'POST',
                                body: JSON.stringify({ action: "delete-invite", data: { name: invite.name } })
                            });
                            const res = await response.json();
                            if (res.status === "success") {
                                showToast(`🗑️ Invitación de ${invite.name} eliminada.`);
                                loadInvites();
                            } else {
                                allInvites = backupInvites;
                                await saveCachedInvites(allInvites);
                                renderTable();
                                showToast("Error al eliminar la invitación.", "error");
                            }
                        } catch (err) {
                            console.error("Error deleting invite:", err);
                            allInvites = backupInvites;
                            await saveCachedInvites(allInvites);
                            renderTable();
                            showToast("Fallo de conexión al eliminar.", "error");
                        }
                    }
                });

                tbody.appendChild(tr);
            }
            updateStats();
            updateBulkShareButtonState();
        };

        const updateStats = () => {
            const total = allInvites.length;
            const confirmed = allInvites.filter(i => i.status === 'Confirmado').length;
            const pending = allInvites.filter(i => i.status === 'Pendiente').length;
            const declined = allInvites.filter(i => i.status === 'Declinado').length;
            const set = (id, val) => { const el = document.getElementById(id); if (el) el.innerText = val; };
            set('stat-total', total);
            set('stat-confirmed', confirmed);
            set('stat-pending', pending);
            set('stat-declined', declined);
        };

        const openEditModal = (invite) => {
            if (!editModal) return;
            editOldName.value = invite.name;
            editGuestName.value = invite.name;
            editPasses.value = invite.max_passes.toString();
            editStatus.value = invite.status;
            editConfirmedPasses.value = invite.confirmed_passes.toString();
            editModal.classList.remove('hidden');
        };

        const closeEditModal = () => {
            if (!editModal) return;
            editModal.classList.add('hidden');
        };

        if (editCancelBtn) editCancelBtn.addEventListener('click', closeEditModal);
        if (editModal) {
            editModal.addEventListener('click', (e) => { if (e.target === editModal) closeEditModal(); });
        }

        if (editSaveBtn) {
            editSaveBtn.addEventListener('click', async () => {
                const oldName = editOldName.value;
                const newName = editGuestName.value.trim();
                const maxPasses = parseInt(editPasses.value, 10);
                const status = editStatus.value;
                const confirmedPasses = parseInt(editConfirmedPasses.value, 10);

                if (!newName) { showToast("El nombre no puede estar vacío.", "error"); return; }

                editSaveBtn.disabled = true;
                editSaveBtn.innerText = "GUARDANDO...";

                const backupInvites = [...allInvites];
                const wasSelected = selectedGuests.has(oldName);
                selectedGuests.delete(oldName);
                if (wasSelected) {
                    selectedGuests.add(newName);
                }
                allInvites = allInvites.map(i => {
                    if (i.name.toLowerCase() === oldName.toLowerCase()) {
                        return {
                            ...i,
                            name: newName,
                            max_passes: maxPasses,
                            status: status,
                            confirmed_passes: confirmedPasses,
                            updated_at: new Date().toISOString()
                        };
                    }
                    return i;
                });
                await saveCachedInvites(allInvites);
                renderTable();
                closeEditModal();
                showToast(`✅ Cambios aplicados localmente.`);

                try {
                    const response = await fetch(BACKEND_URL, {
                        method: 'POST',
                        body: JSON.stringify({
                            action: "update-invite",
                            data: { oldName, newName, max_passes: maxPasses, status, confirmed_passes: confirmedPasses }
                        })
                    });
                    const res = await response.json();
                    if (res.status === "success") {
                        showToast(`✅ Invitación de ${newName} sincronizada con éxito.`);
                        loadInvites();
                    } else {
                        allInvites = backupInvites;
                        await saveCachedInvites(allInvites);
                        renderTable();
                        showToast("Error al guardar cambios en el servidor.", "error");
                    }
                } catch (err) {
                    console.error("Error saving edit:", err);
                    allInvites = backupInvites;
                    await saveCachedInvites(allInvites);
                    renderTable();
                    showToast("Fallo de conexión al guardar.", "error");
                } finally {
                    editSaveBtn.disabled = false;
                    editSaveBtn.innerText = "GUARDAR CAMBIOS";
                }
            });
        }

        // Table controls
        const searchInput = document.getElementById('admin-search');
        const filterSelect = document.getElementById('admin-filter-status');
        const prevBtn = document.getElementById('admin-page-prev');
        const nextBtn = document.getElementById('admin-page-next');
        const refreshBtn = document.getElementById('admin-refresh-btn');
        const selectAllCheckbox = document.getElementById('admin-select-all');
        const bulkBtn = document.getElementById('admin-bulk-share-btn');

        if (searchInput) searchInput.addEventListener('input', () => { currentPage = 1; renderTable(); });
        if (filterSelect) filterSelect.addEventListener('change', () => { currentPage = 1; renderTable(); });

        if (prevBtn) {
            prevBtn.addEventListener('click', () => {
                if (currentPage > 1) { currentPage--; renderTable(); }
            });
        }

        if (nextBtn) {
            nextBtn.addEventListener('click', () => {
                const sv = searchInput ? searchInput.value.toLowerCase().trim() : '';
                const fv = filterSelect ? filterSelect.value : 'todos';
                const count = allInvites.filter(i => i.name.toLowerCase().includes(sv) && (fv === 'todos' || i.status === fv)).length;
                const totalPages = Math.ceil(count / recordsPerPage) || 1;
                if (currentPage < totalPages) { currentPage++; renderTable(); }
            });
        }

        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => { loadInvites(); showToast("Actualizando lista..."); });
        }

        if (selectAllCheckbox) {
            selectAllCheckbox.addEventListener('change', (e) => {
                const tbody = document.getElementById('admin-table-body');
                if (!tbody) return;
                const checkboxes = tbody.querySelectorAll('.admin-row-checkbox');
                checkboxes.forEach(cb => {
                    cb.checked = e.target.checked;
                    const name = cb.getAttribute('data-name');
                    if (name) {
                        if (e.target.checked) {
                            selectedGuests.add(name);
                        } else {
                            selectedGuests.delete(name);
                        }
                    }
                });
                updateBulkShareButtonState();
            });
        }

        const shareModal = document.getElementById('share-modal');
        const shareModalList = document.getElementById('share-modal-list');
        const shareCloseBtn = document.getElementById('share-close-btn');

        if (shareCloseBtn && shareModal) {
            shareCloseBtn.addEventListener('click', () => {
                shareModal.classList.add('hidden');
            });
            shareModal.addEventListener('click', (e) => {
                if (e.target === shareModal) shareModal.classList.add('hidden');
            });
        }

        if (bulkBtn) {
            bulkBtn.addEventListener('click', async () => {
                if (selectedGuests.size === 0) return;

                bulkBtn.disabled = true;
                const originalText = bulkBtn.innerHTML;
                bulkBtn.innerText = "CARGANDO...";

                const selectedInvites = allInvites.filter(i => selectedGuests.has(i.name));

                if (shareModalList) {
                    shareModalList.innerHTML = '';

                    for (const invite of selectedInvites) {
                        const token = await encryptInvite({ name: invite.name, passes: parseInt(invite.max_passes, 10) });
                        const inviteUrl = window.location.origin + window.location.pathname + "?pass=" + token;
                        const messageText = `🎟️ *Invitación de ${invite.name}*\n${invite.max_passes === 1 ? 'Solo Yo (1 pase)' : `${invite.max_passes} pases`}\n\n👉 ${inviteUrl}`;

                        const itemDiv = document.createElement('div');
                        itemDiv.className = 'share-item';

                        itemDiv.innerHTML = `
                            <div class="share-item-info">
                                <strong class="share-item-name">${invite.name}</strong>
                                <span class="share-item-passes">${invite.max_passes} ${invite.max_passes === 1 ? 'pase' : 'pases'}</span>
                            </div>
                            <div class="share-item-actions">
                                <button class="share-copy-btn" title="Copiar mensaje">📋 COPIAR</button>
                                <button class="share-wa-btn" title="Enviar por WhatsApp">💬 ENVIAR</button>
                            </div>
                        `;

                        // Copy handler
                        itemDiv.querySelector('.share-copy-btn').addEventListener('click', (e) => {
                            e.stopPropagation();
                            navigator.clipboard.writeText(messageText).then(() => {
                                showToast(`📋 Mensaje copiado para ${invite.name}`);
                                itemDiv.classList.add('share-item-done');
                            });
                        });

                        // WhatsApp handler
                        itemDiv.querySelector('.share-wa-btn').addEventListener('click', (e) => {
                            e.stopPropagation();
                            const waUrl = `https://api.whatsapp.com/send?text=${encodeURIComponent(messageText)}`;
                            window.open(waUrl, '_blank');
                            itemDiv.classList.add('share-item-done');
                        });

                        shareModalList.appendChild(itemDiv);
                    }
                }

                bulkBtn.disabled = false;
                bulkBtn.innerHTML = originalText;
                const countSpan = document.getElementById('admin-selected-count');
                if (countSpan) countSpan.innerText = selectedGuests.size;

                if (shareModal) {
                    shareModal.classList.remove('hidden');
                }
            });
        }

        const doLogin = () => {
            const enteredPass = adminPassInput.value;
            if (enteredPass === "admin123") {
                adminLoginGroup.classList.add('hidden');
                adminGeneratorGroup.classList.remove('hidden');
                const statsGroup = document.getElementById('admin-stats-group');
                if (statsGroup) statsGroup.classList.remove('hidden');
                const tableContainer = document.getElementById('admin-table-container');
                if (tableContainer) tableContainer.classList.remove('hidden');

                const adminBody = document.querySelector('.admin-body');
                if (adminBody) adminBody.classList.add('admin-logged-in');

                loadInvites();
                showToast("✅ Sesión iniciada correctamente.");
            } else {
                adminLoginError.classList.remove('hidden');
                setTimeout(() => { adminLoginError.classList.add('hidden'); }, 3000);
                showToast("Contraseña incorrecta.", "error");
            }
        };

        if (adminLoginBtn) adminLoginBtn.addEventListener('click', doLogin);
        if (adminPassInput) {
            adminPassInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
        }

        // Generate invitation handler
        const generateBtn = document.getElementById('generate-invite-btn');
        const guestNameInput = document.getElementById('invite-guest-name');
        const passesSelect = document.getElementById('invite-passes');

        if (generateBtn) {
            generateBtn.addEventListener('click', async () => {
                const guestName = guestNameInput.value.trim();
                const passes = passesSelect.value;
                if (!guestName) {
                    showToast("Por favor ingresa el nombre del invitado.", "error");
                    return;
                }

                generateBtn.disabled = true;
                generateBtn.innerText = "GENERANDO...";

                const token = await encryptInvite({ name: guestName, passes: parseInt(passes, 10) });
                if (token) {
                    const cleanUrl = window.location.origin + window.location.pathname + "?pass=" + token;
                    navigator.clipboard.writeText(cleanUrl).then(() => {
                        showToast(`🎟️ Invitación para ${guestName} creada y copiada!`);
                    }).catch(() => {
                        showToast(`🎟️ Invitación para ${guestName} generada!`);
                    });

                    // Optimistic update
                    const newInvite = {
                        name: guestName,
                        max_passes: parseInt(passes, 10),
                        status: "Pendiente",
                        confirmed_passes: 0,
                        updated_at: new Date().toISOString()
                    };

                    allInvites = allInvites.filter(i => i.name.toLowerCase() !== guestName.toLowerCase());
                    allInvites.unshift(newInvite);
                    await saveCachedInvites(allInvites);
                    renderTable();

                    guestNameInput.value = '';

                    try {
                        const response = await fetch(BACKEND_URL, {
                            method: 'POST',
                            body: JSON.stringify({ action: "create-invite", data: { name: guestName, max_passes: parseInt(passes, 10) } })
                        });
                        const res = await response.json();
                        if (res.status !== "success") {
                            showToast("Error al registrar en Google Sheets", "error");
                        }
                        loadInvites();
                    } catch (err) {
                        console.error("Error registering invite in Sheets:", err);
                        showToast("Error de conexión al registrar en Google Sheets", "error");
                    }
                }
                generateBtn.disabled = false;
                generateBtn.innerText = "✨ GENERAR INVITACIÓN";
            });
        }
    };

    const checkInvitationAccess = async () => {
        const urlParams = new URLSearchParams(window.location.search);
        const passToken = urlParams.get('pass');
        const isAdmin = urlParams.get('admin') === 'true';

        const landingOverlay = document.getElementById('landing-overlay');
        const adminOverlay = document.getElementById('admin-overlay');

        // If explicitly admin or NO token is provided, show the admin login screen
        if (isAdmin || !passToken) {
            document.documentElement.classList.remove('no-scroll');
            document.body.classList.remove('no-scroll');
            if (landingOverlay) landingOverlay.classList.add('hidden');
            if (adminOverlay) adminOverlay.classList.remove('hidden');
            initAdminLogic();
            return;
        }

        const guestData = await decryptInvite(passToken);
        if (!guestData) {
            showAccessDenied("El código de tu invitación VIP no es válido o ha expirado.");
            return;
        }

        setupGuestInvitation(guestData);
    };


    // --- Initialize Vanilla Tilt (desktop only — no value on touch devices) ---
    const isTouchDevice = () => window.matchMedia('(hover: none)').matches;


    // --- Interactive Mouse Spotlight Tracker ---
    const updateSpotlight = (e) => {
        const target = e.currentTarget;
        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        target.style.setProperty('--mouse-x', `${x}px`);
        target.style.setProperty('--mouse-y', `${y}px`);
    };

    const registerSpotlights = () => {
        // Spotlight tracker only useful on desktop (needs mouse)
        if (isTouchDevice()) return;
        const items = document.querySelectorAll('.glass-card-v3, .rsvp-card-v3, .timer-box, .t-item');
        items.forEach(item => {
            item.addEventListener('mousemove', updateSpotlight);
        });
    };
    registerSpotlights();

    // --- Dynamic Glare Tracker on VIP Pass Ticket ---
    const initTicketGlare = () => {
        const ticket = document.querySelector('.vip-pass-ticket');
        if (ticket) {
            ticket.addEventListener('mousemove', e => {
                const rect = ticket.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                ticket.style.setProperty('--glare-x', `${x}px`);
                ticket.style.setProperty('--glare-y', `${y}px`);
            });
        }
    };

    // --- GSAP Landing Intro Animation (desktop only, skip on touch/mobile for performance) ---
    if (typeof gsap !== 'undefined' && !isTouchDevice()) {
        const introTl = gsap.timeline();
        introTl.set(".landing-frame", { scale: 1.02, opacity: 0 })
            .set(".landing-roulette-bg", { scale: 0.8, opacity: 0 })
            .set(".corner-decor", { opacity: 0 })
            .set(".side-chip", { scale: 0.5, opacity: 0 })
            .set(".envelope-wrapper", { scale: 0.96, y: 20, opacity: 0 });

        introTl.to(".landing-frame", { duration: 0.5, scale: 1, opacity: 1, ease: "power2.out" })
            .to(".landing-roulette-bg", { duration: 0.6, scale: 1, opacity: 0.04, ease: "power2.out" }, "-=0.3")
            .to(".envelope-wrapper", { duration: 0.6, scale: 1, y: 0, opacity: 1, ease: "back.out(1.0)" }, "-=0.4")
            .to(".side-chip", { duration: 0.5, scale: 1, opacity: 0.85, stagger: 0.05, ease: "back.out(1.2)" }, "-=0.3")
            .to(".corner-decor", { duration: 0.4, opacity: 1, stagger: 0.04, ease: "power2.out" }, "-=0.2");
    }



    // --- UI Controls ---
    const sealContainer = document.querySelector('.envelope-seal-container');
    const envelope = document.querySelector('.envelope');
    const openBtn = document.getElementById('open-btn');
    const landingOverlay = document.getElementById('landing-overlay');
    const mainContent = document.getElementById('main-content');
    const musicControl = document.getElementById('music-control');
    const musicIcon = document.getElementById('music-icon');

    // --- Wave animation splitter for card quote ---
    const quoteEl = document.querySelector('.card-quote');
    if (quoteEl) {
        const text = quoteEl.innerText;
        quoteEl.innerHTML = '';
        text.split('').forEach((char, index) => {
            const span = document.createElement('span');
            span.className = 'wave-letter';
            span.style.animationDelay = `${index * 0.04}s`;
            if (char === ' ') {
                span.innerHTML = '&nbsp;';
            } else {
                span.innerText = char;
            }
            quoteEl.appendChild(span);
        });
    }
    const audio = document.getElementById('bg-music');

    // Envelope opening interaction & Site Reveal Transition
    let transitionTriggered = false;
    const triggerMainReveal = (instant = false) => {
        if (transitionTriggered) return;
        transitionTriggered = true;

        // Trigger cinematic sequential gold confetti explosion on reveal
        if (typeof confetti !== 'undefined') {
            // Cannon 1: Central main burst
            confetti({
                particleCount: 100,
                spread: 80,
                origin: { y: 0.55 },
                colors: ['#fffbe0', '#f9e272', '#d4af37', '#996515']
            });

            // Cannons 2 & 3: Side cannons firing inward 250ms later for layered cascade
            setTimeout(() => {
                confetti({
                    particleCount: 90,
                    angle: 60,
                    spread: 65,
                    origin: { x: 0, y: 0.85 },
                    colors: ['#fffbe0', '#f9e272', '#d4af37', '#996515']
                });
                confetti({
                    particleCount: 90,
                    angle: 120,
                    spread: 65,
                    origin: { x: 1, y: 0.85 },
                    colors: ['#fffbe0', '#f9e272', '#d4af37', '#996515']
                });
            }, 250);
        }

        document.documentElement.classList.remove('no-scroll');
        document.body.classList.remove('no-scroll');

        if (typeof gsap !== 'undefined') {
            mainContent.style.display = 'block';
            mainContent.classList.remove('hidden');
            if (instant) {
                if (landingOverlay) landingOverlay.style.display = "none";
            } else if (isTouchDevice()) {
                // Mobile: skip all GSAP transitions — instant reveal, zero lag
                if (landingOverlay) landingOverlay.style.display = "none";
                document.querySelectorAll('.hero-frame, .floating-asset, .floating-card, .hero-text > *').forEach(el => {
                    el.style.opacity = '1';
                    el.style.transform = 'none';
                });
                const yearsElM = document.getElementById('typewriter-years');
                const infoElM = document.getElementById('typewriter-info');
                if (yearsElM) { yearsElM.innerHTML = "MIS XV A\u00d1OS"; yearsElM.style.borderRight = "none"; yearsElM.style.display = "block"; }
                if (infoElM) { infoElM.innerHTML = "\u2660 15 AGO 2026 \u2022 8:30 PM \u2022 CASUAL \u2660"; infoElM.style.borderRight = "none"; infoElM.style.display = "flex"; }
            } else {
                // Desktop: full GSAP transition
                const startTypewriterAnimations = () => {
                    const yearsEl = document.getElementById('typewriter-years');
                    const infoEl = document.getElementById('typewriter-info');
                    if (!yearsEl || !infoEl) return;

                    const yearsText = "MIS XV A\u00d1OS";
                    const infoText = "\u2660 15 AGO 2026  \u2022  8:30 PM  \u2022  CASUAL \u2660";

                    yearsEl.innerHTML = '';
                    infoEl.innerHTML = '';
                    
                    yearsEl.style.borderRight = "2px solid var(--gold)";
                    yearsEl.style.display = "inline-block";
                    yearsEl.style.width = "auto";
                    yearsEl.style.paddingRight = "4px";

                    let i = 0;
                    function typeYears() {
                        if (i < yearsText.length) {
                            yearsEl.innerHTML += yearsText.charAt(i);
                            i++;
                            setTimeout(typeYears, 90);
                        } else {
                            yearsEl.style.borderRight = "none";
                            yearsEl.style.display = "block";
                            yearsEl.style.width = "100%";
                            
                            infoEl.style.borderRight = "2px solid var(--gold)";
                            infoEl.style.display = "inline-block";
                            infoEl.style.width = "auto";
                            infoEl.style.paddingRight = "4px";
                            
                            let j = 0;
                            function typeInfo() {
                                if (j < infoText.length) {
                                    infoEl.innerHTML += infoText.charAt(j);
                                    j++;
                                    setTimeout(typeInfo, 50);
                                } else {
                                    infoEl.style.borderRight = "none";
                                    infoEl.style.display = "flex";
                                    infoEl.style.width = "100%";
                                }
                            }
                            typeInfo();
                        }
                    }
                    typeYears();
                };

                const tl = gsap.timeline({
                    onComplete: () => {
                        document.querySelectorAll('.hero-frame, .floating-asset, .floating-card, .hero-text > *').forEach(el => {
                            el.style.opacity = '1';
                            el.style.transform = 'none';
                        });
                        startTypewriterAnimations();
                    }
                });
                tl.to(".envelope-wrapper", { duration: 0.12, scale: 0.95, opacity: 0, ease: "power2.in" })
                    .to([".side-chip", ".landing-roulette-bg", ".landing-frame", ".corner-decor"], { duration: 0.12, opacity: 0, ease: "power2.in" }, "-=0.12")
                    .to(landingOverlay, { duration: 0.2, opacity: 0, ease: "power2.out" }, "-=0.08")
                    .set(landingOverlay, { display: "none" })
                    .from(".hero-text > *", { duration: 0.25, y: 10, opacity: 0, stagger: 0.03, ease: "power2.out" }, "-=0.12")
                    .from(".hero-frame", { duration: 0.25, scale: 0.99, opacity: 0, ease: "power2.out" }, "-=0.2")
                    .from([".floating-asset", ".floating-card"], { duration: 0.35, scale: 0.7, opacity: 0, stagger: 0.03, ease: "back.out(1.1)" }, "-=0.22");
            }
        } else {
            mainContent.style.display = 'block';
            mainContent.classList.remove('hidden');
            if (landingOverlay) landingOverlay.style.display = "none";
        }

        initCountdown();
    };

    if (envelope) {
        envelope.addEventListener('click', (e) => {
            if (envelope.classList.contains('processing') || transitionTriggered) return;
            envelope.classList.add('processing');

            if (document.querySelector('.envelope-instruction')) {
                document.querySelector('.envelope-instruction').style.opacity = '0';
            }



            // Auto start audio music on envelope break
            if (audio && musicIcon && musicControl) {
                audio.play().then(() => {
                    musicIcon.classList.add('rotating');
                }).catch(() => { });
                musicControl.classList.remove('hidden');
            }

            if (typeof gsap !== 'undefined') {
                gsap.set(".envelope-flap", { transition: "none" });
                gsap.set(".envelope-seal-container", { transition: "none" });

                const openTl = gsap.timeline({
                    onComplete: () => {
                        triggerMainReveal(true);
                    }
                });
 
                openTl
                    .to(".envelope-seal-container", { duration: 0.25, scale: 0.6, opacity: 0, ease: "back.in(1.5)" })
                    .to(".envelope-flap", {
                        duration: 0.45,
                        rotateX: 180,
                        ease: "power2.inOut",
                        onStart: () => {
                            gsap.set(".envelope-flap", { zIndex: 1 });
                        }
                    }, "-=0.1")
                    .to(".envelope-paper", {
                        duration: 0.85,
                        y: "-65%",
                        scale: 1.03,
                        ease: "power3.out",
                        onStart: () => {
                            gsap.set(".envelope-paper", { zIndex: 12 });
                        }
                    }, "-=0.15")
                    .to([".envelope-wrapper", ".side-chip", ".landing-roulette-bg", ".landing-frame", ".corner-decor"], {
                        duration: 0.5,
                        opacity: 0,
                        ease: "power2.inOut",
                        onStart: () => {
                            // Display the main content underneath before the overlay fades out!
                            mainContent.style.display = 'block';
                            mainContent.classList.remove('hidden');
                        }
                    }, "+=6.5")
                    .to(landingOverlay, {
                        duration: 0.5,
                        opacity: 0,
                        ease: "power2.inOut"
                    }, "-=0.5");
            } else {
                triggerMainReveal();
            }
        });
    }

    // Music control toggle click
    if (musicControl && audio && musicIcon) {
        musicControl.addEventListener('click', (e) => {
            e.stopPropagation();
            if (audio.paused) {
                audio.play();
                musicIcon.classList.add('rotating');
            } else {
                audio.pause();
                musicIcon.classList.remove('rotating');
            }
        });
    }

    // Entering the invitation from card button (can click immediately to skip delay)
    if (openBtn) {
        openBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            triggerMainReveal();
        });
    }

    // --- Countdown ---
    function initCountdown() {
        const target = new Date("August 15, 2026 00:00:00").getTime();
        // Cache DOM elements once
        const daysEl = document.getElementById('days');
        const hoursEl = document.getElementById('hours');
        const minutesEl = document.getElementById('minutes');
        const secondsEl = document.getElementById('seconds');
        const dBar = document.getElementById('days-bar');
        const hBar = document.getElementById('hours-bar');
        const mBar = document.getElementById('minutes-bar');
        const sBar = document.getElementById('seconds-bar');
        const maxOffset = 282.74;
        const maxDaysVal = 90;

        const updateTimer = () => {
            const now = Date.now();
            const diff = target - now;
            if (diff <= 0) return;

            const d = Math.floor(diff / (1000 * 60 * 60 * 24));
            const h = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
            const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((diff % (1000 * 60)) / 1000);

            if (daysEl) daysEl.innerText = d.toString().padStart(2, '0');
            if (hoursEl) hoursEl.innerText = h.toString().padStart(2, '0');
            if (minutesEl) minutesEl.innerText = m.toString().padStart(2, '0');
            if (secondsEl) secondsEl.innerText = s.toString().padStart(2, '0');

            if (dBar) dBar.style.strokeDashoffset = (maxOffset - Math.min(1, d / maxDaysVal) * maxOffset);
            if (hBar) hBar.style.strokeDashoffset = (maxOffset - (h / 24) * maxOffset);
            if (mBar) mBar.style.strokeDashoffset = (maxOffset - (m / 60) * maxOffset);
            if (sBar) sBar.style.strokeDashoffset = (maxOffset - (s / 60) * maxOffset);
        };

        // Use setInterval at 1fps — perfectly sufficient for a countdown timer
        updateTimer();
        setInterval(updateTimer, 1000);
    }

    // --- GSAP ScrollTrigger reveals (Instant on mobile, animated on desktop) ---
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);

        if (isTouchDevice()) {
            // Mobile: make all reveal elements visible immediately — no scroll animation lag
            document.querySelectorAll('.reveal').forEach(el => {
                el.style.opacity = '1';
                el.style.transform = 'none';
            });
        } else {
            gsap.set(".reveal", { y: 15, opacity: 0 });

            const reveals = gsap.utils.toArray('.reveal');
            reveals.forEach(el => {
                gsap.to(el, {
                    scrollTrigger: {
                        trigger: el,
                        start: "top 95%",
                        toggleActions: "play none none reverse"
                    },
                    y: 0,
                    opacity: 1,
                    duration: 0.45,
                    ease: "power2.out"
                });
            });
        }
    }

    // --- Copy CLABE Code with Tooltip ---
    const copyClabe = document.getElementById('copy-clabe');
    const clabeVal = document.getElementById('clabe-val');
    if (copyClabe && clabeVal) {
        const tooltip = document.createElement('span');
        tooltip.className = 'clabe-tooltip cinzel-font';
        tooltip.innerText = '¡Copiado!';
        copyClabe.appendChild(tooltip);

        copyClabe.addEventListener('click', () => {
            const textToCopy = clabeVal.innerText.replace(/\s+/g, '');
            navigator.clipboard.writeText(textToCopy).then(() => {
                tooltip.classList.add('show');
                setTimeout(() => tooltip.classList.remove('show'), 2000);
            }).catch(err => {
                console.error('Failed to copy CLABE: ', err);
            });
        });
    }

    // --- RSVP VIP Pass Generation ---
    const rsvpForm = document.getElementById('rsvp-form');
    const rsvpMessage = document.getElementById('rsvp-message');
    const rsvpDeclineMessage = document.getElementById('rsvp-decline-message');
    const declineBtn = document.getElementById('rsvp-decline-btn');

    if (rsvpForm && rsvpMessage) {
        rsvpForm.addEventListener('submit', (e) => {
            e.preventDefault();

            const guestName = document.getElementById('rsvp-name').value.trim();
            const guestSelect = document.getElementById('rsvp-guests');
            const passText = guestSelect ? guestSelect.options[guestSelect.selectedIndex].text.toUpperCase() : "1 PASE";

            const countEl = document.getElementById('pass-count-text');
            if (countEl) countEl.innerText = "ACCESO AUTORIZADO: " + passText;

            // Submit RSVP to Spreadsheet & trigger Telegram notification in background
            const selectedPassCount = guestSelect ? parseInt(guestSelect.value, 10) + 1 : 1;

            // Save response in localStorage to remember on page reload
            const urlParams = new URLSearchParams(window.location.search);
            const passToken = urlParams.get('pass');
            if (passToken) {
                setStorageItem('rsvp_status_' + passToken, 'confirmed');
                setStorageItem('rsvp_pass_text_' + passToken, passText);
            }

            fetch(BACKEND_URL, {
                method: 'POST',
                body: JSON.stringify({
                    action: "rsvp",
                    data: {
                        name: guestName,
                        confirmed: true,
                        passes: selectedPassCount
                    }
                })
            }).catch(err => console.error("Error saving RSVP to Sheets:", err));

            if (typeof gsap !== 'undefined') {
                gsap.to(rsvpForm, {
                    duration: 0.5, scale: 0.8, opacity: 0, onComplete: () => {
                        rsvpForm.style.display = "none";
                        rsvpMessage.style.display = "block";
                        gsap.fromTo(rsvpMessage, {
                            y: 30, opacity: 0
                        }, {
                            duration: 0.8, y: 0, opacity: 1, ease: "power3.out"
                        });
                    }
                });
            } else {
                rsvpForm.style.display = "none";
                rsvpMessage.style.display = "block";
            }
        });

        if (declineBtn && rsvpDeclineMessage) {
            declineBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const guestName = document.getElementById('rsvp-name').value.trim();

                // Save response in localStorage to remember on page reload
                const urlParams = new URLSearchParams(window.location.search);
                const passToken = urlParams.get('pass');
                if (passToken) {
                    setStorageItem('rsvp_status_' + passToken, 'declined');
                }

                // Submit RSVP to Spreadsheet (confirmed: false, passes: 0)
                fetch(BACKEND_URL, {
                    method: 'POST',
                    body: JSON.stringify({
                        action: "rsvp",
                        data: {
                            name: guestName,
                            confirmed: false,
                            passes: 0
                        }
                    })
                }).catch(err => console.error("Error saving RSVP to Sheets:", err));

                if (typeof gsap !== 'undefined') {
                    gsap.to(rsvpForm, {
                        duration: 0.5, scale: 0.8, opacity: 0, onComplete: () => {
                            rsvpForm.style.display = "none";
                            rsvpDeclineMessage.style.display = "block";
                            gsap.fromTo(rsvpDeclineMessage, {
                                y: 30, opacity: 0
                            }, {
                                duration: 0.8, y: 0, opacity: 1, ease: "power3.out"
                            });
                        }
                    });
                } else {
                    rsvpForm.style.display = "none";
                    rsvpDeclineMessage.style.display = "block";
                }
            });
        }
    }

    // --- Gallery Lightbox ---
    const galleryCards = document.querySelectorAll('.gallery-card');
    const lightboxModal = document.getElementById('lightbox-modal');
    const lightboxImg = document.getElementById('lightbox-img');
    const lightboxClose = document.getElementById('lightbox-close');
    const lightboxPrev = document.getElementById('lightbox-prev');
    const lightboxNext = document.getElementById('lightbox-next');

    let currentImgIndex = 0;
    const galleryImages = Array.from(galleryCards).map(card => card.querySelector('.gallery-img').src);

    if (galleryCards.length > 0 && lightboxModal && lightboxImg) {
        const showImage = (index) => {
            currentImgIndex = index;
            lightboxImg.src = galleryImages[index];
            lightboxModal.classList.add('show');
        };

        galleryCards.forEach((card, index) => {
            card.addEventListener('click', () => {
                showImage(index);
            });
        });

        const closeLightbox = () => {
            lightboxModal.classList.remove('show');
        };

        if (lightboxClose) lightboxClose.addEventListener('click', closeLightbox);

        lightboxModal.addEventListener('click', (e) => {
            if (e.target === lightboxModal) closeLightbox();
        });

        if (lightboxPrev) {
            lightboxPrev.addEventListener('click', (e) => {
                e.stopPropagation();
                let nextIdx = currentImgIndex - 1;
                if (nextIdx < 0) nextIdx = galleryImages.length - 1;
                showImage(nextIdx);
            });
        }

        if (lightboxNext) {
            lightboxNext.addEventListener('click', (e) => {
                e.stopPropagation();
                let nextIdx = currentImgIndex + 1;
                if (nextIdx >= galleryImages.length) nextIdx = 0;
                showImage(nextIdx);
            });
        }

        document.addEventListener('keydown', (e) => {
            if (!lightboxModal.classList.contains('show')) return;
            if (e.key === 'Escape') closeLightbox();
            if (e.key === 'ArrowLeft' && lightboxPrev) lightboxPrev.click();
            if (e.key === 'ArrowRight' && lightboxNext) lightboxNext.click();
        });
    }

    // --- Lluvia de Oro (Gold Rain) via GSAP ---
    function createFloatingParticles() {
        const particleContainer = document.createElement('div');
        particleContainer.id = "particle-container";
        particleContainer.style.position = "fixed";
        particleContainer.style.top = "0";
        particleContainer.style.left = "0";
        particleContainer.style.width = "100vw";
        particleContainer.style.height = "100vh";
        particleContainer.style.pointerEvents = "none";
        particleContainer.style.zIndex = "9999";
        particleContainer.style.overflow = "hidden";
        document.body.appendChild(particleContainer);

        const symbols = ['|', '✦', '·', '⋆'];
        const colors = ['var(--gold)', 'var(--gold-bright)', '#ffdf00', '#d4af37'];
        const numParticles = 120; // Dense rain

        for (let i = 0; i < numParticles; i++) {
            const particle = document.createElement('div');
            
            // Random properties
            const symbol = symbols[Math.floor(Math.random() * symbols.length)];
            const color = colors[Math.floor(Math.random() * colors.length)];
            const size = Math.random() * 10 + 6; 
            const left = Math.random() * 100; 
            const duration = Math.random() * 4 + 2; 
            const delay = Math.random() * 5; // Positive delay for GSAP start
            const maxOpacity = Math.random() * 0.4 + 0.3; 
            
            particle.innerHTML = symbol;
            particle.style.position = "absolute";
            particle.style.color = color;
            particle.style.fontSize = `${size}px`;
            particle.style.left = `${left}vw`;
            particle.style.top = "-10vh"; // Start above screen
            particle.style.opacity = "0";
            particle.style.userSelect = "none";
            particle.style.pointerEvents = "none";
            particle.style.fontFamily = "'Cinzel', serif";
            particle.style.textShadow = "0 0 10px rgba(212, 175, 55, 0.4)";
            
            particleContainer.appendChild(particle);
            
            // GSAP Animation
            if (typeof gsap !== 'undefined') {
                gsap.to(particle, {
                    y: "120vh",
                    x: "+=5vw", // Slight wind effect
                    rotation: 15,
                    duration: duration,
                    repeat: -1,
                    delay: -delay, // Negative delay to start randomly in progress
                    ease: "none",
                    onStart: function() {
                        // Fade in and out during the fall
                        gsap.to(particle, { opacity: maxOpacity, duration: 0.3, ease: "power1.in" });
                        gsap.to(particle, { opacity: 0, duration: 0.5, delay: duration - 0.5, ease: "power1.out" });
                    },
                    onRepeat: function() {
                        gsap.set(particle, { opacity: 0 });
                        gsap.to(particle, { opacity: maxOpacity, duration: 0.3, ease: "power1.in" });
                        gsap.to(particle, { opacity: 0, duration: 0.5, delay: duration - 0.5, ease: "power1.out" });
                    }
                });
            }
        }
    }

    // createFloatingParticles();

    // --- Interactive Gold Cursor Trail ---
    function initCursorTrail() {
        // Only run on non-touch devices
        if ('ontouchstart' in window || navigator.maxTouchPoints > 0) return;

        const cursorContainer = document.createElement('div');
        cursorContainer.id = "cursor-trail-container";
        cursorContainer.style.position = "fixed";
        cursorContainer.style.top = "0";
        cursorContainer.style.left = "0";
        cursorContainer.style.width = "100vw";
        cursorContainer.style.height = "100vh";
        cursorContainer.style.pointerEvents = "none";
        cursorContainer.style.zIndex = "9998";
        document.body.appendChild(cursorContainer);

        const colors = ['var(--gold)', 'var(--gold-bright)', '#ffffff'];
        
        document.addEventListener('mousemove', (e) => {
            // Throttle particle creation slightly
            if (Math.random() > 0.4) return;

            const particle = document.createElement('div');
            const size = Math.random() * 6 + 2; 
            const color = colors[Math.floor(Math.random() * colors.length)];
            
            particle.style.position = "absolute";
            particle.style.left = `${e.clientX}px`;
            particle.style.top = `${e.clientY}px`;
            particle.style.width = `${size}px`;
            particle.style.height = `${size}px`;
            particle.style.backgroundColor = color;
            particle.style.borderRadius = "50%";
            particle.style.boxShadow = `0 0 ${size * 2}px ${color}`;
            particle.style.pointerEvents = "none";
            
            cursorContainer.appendChild(particle);
            
            if (typeof gsap !== 'undefined') {
                gsap.to(particle, {
                    x: (Math.random() - 0.5) * 60,
                    y: (Math.random() - 0.5) * 60 + 20,
                    opacity: 0,
                    scale: 0,
                    duration: Math.random() * 0.5 + 0.6,
                    ease: "power2.out",
                    onComplete: () => {
                        particle.remove();
                    }
                });
            } else {
                particle.remove();
            }
        });
    }

    initCursorTrail();

    // --- Manual Access Code Validation ---
    const manualPassBtn = document.getElementById('manual-pass-btn');
    const manualPassInput = document.getElementById('manual-pass-input');
    
    if (manualPassBtn && manualPassInput) {
        const handleManualLogin = () => {
            const val = manualPassInput.value.trim();
            if (val) {
                // Redirect to the same URL but with the pass token
                window.location.href = window.location.pathname + "?pass=" + encodeURIComponent(val);
            }
        };
        manualPassBtn.addEventListener('click', handleManualLogin);
        manualPassInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleManualLogin();
        });
    }

    // Run access control check immediately after all functions are initialized
    checkInvitationAccess();
});
