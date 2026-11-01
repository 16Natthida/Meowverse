<template>
  <div class="import-fee-page">
    <AdminPageHeader title="กรอกค่านำเข้าสินค้าพรีออเดอร์" description="เลือกกรอกค่านำเข้ารวมทั้งโพสต์ หรือแยกตามกลุ่มตัวเลือกสินค้าได้เอง" />
    <div class="card selector-card">
      <label class="field-label">เลือกรอบพรีออเดอร์</label>
      <div class="select-row">
        <div class="select-wrap">
          <select v-model="selectedRoundId" class="round-select" :disabled="loading">
            <option value="" disabled>— เลือกรอบพรีออเดอร์ —</option>
            <option v-for="round in rounds" :key="round.round_key" :value="round.round_key">{{ round.round_name }}</option>
          </select>
          <span class="select-chevron">⌄</span>
        </div>
        <span v-if="selectedRound" class="round-badge" :class="statusBadgeClass(selectedRound.round_status)">{{ statusLabel(selectedRound.round_status) }}</span>
        <span v-if="loading" class="spinner" aria-label="กำลังโหลด"></span>
      </div>
    </div>

    <div v-if="selectedRound && primaryProducts.length" class="card table-card fee-table">
      <div class="table-header">
        <div><span class="table-title">รายการสินค้าในรอบ <b>{{ selectedRound.round_name }}</b></span><p class="table-hint">โหมดรวมใช้ช่องหลัก ส่วนโหมดแยกให้จัดกลุ่มและกรอกใน Dropdown</p></div>
        <span class="table-count">{{ primaryProducts.length }} สินค้าหลัก</span>
      </div>
      <div class="product-list">
        <article v-for="product in primaryProducts" :key="product.key" class="product-card" :class="{ 'product-card--expanded': isExpanded(product.key) }">
          <div class="product-main-row">
            <div class="product-cell">
              <button v-if="product.image_url" type="button" class="thumb-btn" @click="openImagePreview(product.image_url, product.product_name)" :aria-label="`ดูรูป ${product.product_name}`"><img :src="product.image_url" :alt="product.product_name" class="product-cell-thumb" loading="lazy" /></button>
              <div v-else class="product-cell-thumb product-cell-thumb--placeholder">🐾</div>
              <div class="product-copy"><div class="product-name">{{ product.product_name }}</div><div class="product-code">รหัสสินค้า #{{ product.prod_id }} · {{ product.variantCount }} ตัวเลือก · {{ product.customerCount }} ลูกค้า</div></div>
            </div>
            <div class="main-metric"><span>แพ็กที่สั่งรวม</span><strong>{{ product.totalQty }} แพ็ก</strong></div>
            <label class="mode-switch"><input type="checkbox" :checked="product.mode === 'separate'" :disabled="saving || (hasSavedImportFee && !isEditMode)" @change="onModeToggle(product, $event)" /><span>กรอกค่านำเข้าแยก</span></label>
            <div class="main-metric main-metric--fee">
              <span>{{ product.mode === 'separate' ? 'ค่านำเข้ารวมทุกกลุ่ม' : 'ค่านำเข้ารวมทั้งโพสต์' }}</span>
              <div v-if="product.mode === 'aggregate' && !isRoundLocked" class="fee-input-wrap"><span class="fee-prefix">฿</span><input type="text" inputmode="decimal" class="fee-input" :value="feeInputs[aggregateInputKey(product)]" :disabled="saving" maxlength="13" placeholder="0.00" @input="onFeeInput(aggregateInputKey(product), $event)" @blur="onFeeInputBlur(aggregateInputKey(product))" /></div>
              <span v-else class="main-fee-total">{{ formatMoney(product.totalFee) }}</span>
            </div>
            <div class="main-metric"><span>เฉลี่ยต่อแพ็ก</span><strong>{{ formatMoney(product.averageFee) }}</strong></div>
            <button type="button" class="dropdown-btn" @click="toggleExpanded(product.key)" :aria-expanded="isExpanded(product.key)"><span>{{ isExpanded(product.key) ? 'ย่อ' : 'รายละเอียด' }}</span><span class="dropdown-chevron" :class="{ 'dropdown-chevron--open': isExpanded(product.key) }">⌄</span></button>
          </div>

          <div v-if="isExpanded(product.key)" class="detail-panel">
            <div class="detail-panel-head"><div><strong>รายละเอียดตัวเลือกสินค้า</strong><span v-if="product.mode === 'aggregate'">ทุกตัวเลือกใช้ค่านำเข้าต่อแพ็กเดียวกัน</span><span v-else>จัดกลุ่มตัวเลือกได้เอง โดยตัวเลือกหนึ่งรายการอยู่ได้เพียงกลุ่มเดียว</span></div><span class="detail-total">{{ product.totalQty }} แพ็ก · {{ product.customerCount }} ลูกค้า</span></div>

            <template v-if="product.mode === 'aggregate'">
              <div v-for="group in product.suggestedGroups" :key="group.key" class="pack-group">
                <div class="pack-group-head"><div><span class="pack-chip">{{ packLabel(group.pack_size) }}</span><span class="pack-subtitle">{{ group.totalQty }} แพ็ก · {{ group.customerCount }} ลูกค้า · {{ group.items.length }} ตัวเลือก</span></div><span class="pack-readonly-fee">เฉลี่ย {{ formatMoney(product.averageFee) }} / แพ็ก</span></div>
                <div class="flavor-list"><div v-for="item in group.items" :key="item.option_key" class="flavor-row"><span class="flavor-tag">{{ item.flavorDisplay || 'ไม่ระบุรสชาติ' }}</span><span>{{ item.ordered_qty }} แพ็ก <small>รับ {{ item.total_received_qty }} แพ็ก</small></span></div></div>
              </div>
              <div v-if="product.hasMultiplePackSizes" class="note-warning note-warning--info">โหมดรวมจะเฉลี่ยค่านำเข้าต่อแพ็กเท่ากันทุกขนาด แม้ต้นทุนจริงของแต่ละขนาดอาจต่างกัน</div>
            </template>

            <template v-else>
              <div v-for="group in product.separateGroups" :key="group.group_id" class="pack-group pack-group--editable">
                <div class="pack-group-head pack-group-head--editable"><div class="group-name-wrap"><input class="group-name-input" :value="group.label" @input="updateGroupLabel(product, group.group_id, $event)" /><span class="pack-subtitle">{{ group.totalQty }} แพ็ก · {{ group.customerCount }} ลูกค้า · {{ group.items.length }} ตัวเลือก</span></div></div>
                <div class="group-fee-row"><span>ค่านำเข้ารวมกลุ่มนี้ · เฉลี่ย {{ formatMoney(group.averageFee) }} / แพ็ก</span><div v-if="group.totalQty > 0 && !isRoundLocked" class="fee-input-wrap"><span class="fee-prefix">฿</span><input type="text" inputmode="decimal" class="fee-input" :value="feeInputs[groupInputKey(product, group.group_id)]" :disabled="saving" maxlength="13" placeholder="0.00" @input="onFeeInput(groupInputKey(product, group.group_id), $event)" @blur="onFeeInputBlur(groupInputKey(product, group.group_id))" /></div><span v-else class="fee-locked-chip">{{ formatMoney(group.totalFee) }}</span></div>
                <div class="flavor-list"><div v-for="item in group.items" :key="item.option_key" class="flavor-row flavor-row--assign"><span class="flavor-tag">{{ item.flavorDisplay || 'ไม่ระบุรสชาติ' }} · {{ packLabel(item.pack_size) }}</span><span class="assign-control"><span>{{ item.ordered_qty }} แพ็ก</span><select :value="groupIdForOption(product, item.option_key)" @change="assignOption(product, item.option_key, $event.target.value)"><option value="">ย้ายไปกลุ่ม...</option><option v-for="choice in product.separateGroups" :key="choice.group_id" :value="choice.group_id">{{ choice.label }}</option></select></span></div></div>
              </div>
              <div v-if="unassignedItems(product).length" class="unassigned-panel"><strong>ตัวเลือกที่ยังจัดกลุ่มไม่ได้</strong><div v-for="item in unassignedItems(product)" :key="item.option_key" class="flavor-row flavor-row--assign"><span class="flavor-tag">{{ item.flavorDisplay || 'ไม่ระบุรสชาติ' }} · {{ packLabel(item.pack_size) }}</span><span class="assign-control"><span>{{ item.ordered_qty }} แพ็ก</span><select :value="groupIdForOption(product, item.option_key)" @change="assignOption(product, item.option_key, $event.target.value)"><option value="">เลือกกลุ่ม</option><option v-for="choice in product.separateGroups" :key="choice.group_id" :value="choice.group_id">{{ choice.label }}</option></select></span></div></div>
            </template>
          </div>
        </article>
      </div>
      <div v-if="hasUnspecifiedPackSize" class="note-warning note-warning--info">ขนาดแพ็กที่ฐานข้อมูลยังระบุไม่ได้จะไม่ถูกเดา แอดมินสามารถเลือกจัดกลุ่มเองในโหมดกรอกแยกได้</div>
      <div class="actions"><button v-if="hasSavedImportFee && !isEditMode" class="btn-edit" type="button" :disabled="saving || loading" @click="requestEdit">แก้ไขค่านำเข้า</button><button class="btn-save" type="button" @click="openSavePreview" :disabled="saving || loading || (hasSavedImportFee && !isEditMode)">{{ saving ? 'กำลังบันทึก...' : 'ตรวจสอบและบันทึก' }}</button><span v-if="successMessage" class="toast toast--success">✓ {{ successMessage }}</span><span v-if="errorMessage" class="toast toast--error">✕ {{ errorMessage }}</span></div>
    </div>
    <div v-else-if="selectedRound && !loading" class="empty-state">รอบนี้ยังไม่มีรายการที่พร้อมกรอกค่านำเข้า</div>
    <div v-else-if="!loading" class="empty-state">เลือกรอบพรีออเดอร์เพื่อเริ่มกรอกค่านำเข้า</div>

    <div v-if="showPreview" class="modal-overlay" @click.self="showPreview = false"><div class="preview-modal-card"><div class="preview-modal-head"><div><h2>ตรวจสอบก่อนบันทึก</h2><p>โหมดและยอดใหม่นี้จะถูกบันทึกพร้อมกัน และกระจายไปยังรายละเอียดออเดอร์จริง</p></div><button type="button" class="image-modal-close" @click="showPreview = false">✕</button></div><div class="preview-list"><div v-for="row in previewRows" :key="row.key" class="preview-row"><div><strong>{{ row.product_name }}</strong><span>{{ row.label }} · {{ row.totalQty }} แพ็ก</span></div><div class="preview-amount"><b>{{ formatMoney(row.fee) }}</b><small>{{ formatMoney(row.averageFee) }} / แพ็ก</small></div></div></div><div class="preview-total"><span>ค่านำเข้ารวมทั้งหมด</span><strong>{{ formatMoney(previewTotal) }}</strong></div><div class="preview-actions"><button type="button" class="btn-edit" @click="showPreview = false">กลับไปแก้ไข</button><button type="button" class="btn-save" @click="saveImportFees">ยืนยันบันทึก</button></div></div></div>
    <div v-if="previewImage" class="modal-overlay" @click.self="closeImagePreview"><div class="image-modal-card"><button type="button" class="image-modal-close" @click="closeImagePreview">✕</button><img :src="previewImage.url" :alt="previewImage.title" class="image-modal-img" /><p class="image-modal-caption">{{ previewImage.title }}</p></div></div>
  </div>
</template>

<script setup>
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue'
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { useAuth } from '../../composables/useAuth'
import translateError from '../../utils/translateError'

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'
const { getUser } = useAuth()
const currentUser = computed(() => getUser())
const rounds = ref([]), selectedRoundId = ref(''), loading = ref(false), saving = ref(false), isEditMode = ref(false)
const feeInputs = ref({}), modeDrafts = ref({}), groupDrafts = ref({}), expandedProductKeys = ref(new Set())
const successMessage = ref(''), errorMessage = ref(''), previewImage = ref(null), showPreview = ref(false)
const selectedRound = computed(() => rounds.value.find((round) => round.round_key === selectedRoundId.value) || null)
const hasSavedImportFee = computed(() => Boolean(selectedRound.value?.has_saved_import_fee))
const isRoundLocked = computed(() => hasSavedImportFee.value && !isEditMode.value)

function normalizeArrivalStatus(value) { const v = String(value || 'Pending').trim().toLowerCase(); return v === 'delayed' ? 'Delayed' : v === 'missing' ? 'Missing' : v === 'pending' ? 'Pending' : 'Arrived' }
function normalizePackSize(value) { const v = String(value ?? '').trim(); return v || '__unspecified__' }
function packLabel(value) { const v = String(value ?? '').trim(); return v && v !== '__unspecified__' ? `ขนาด ${v}` : 'ไม่ระบุขนาด' }
function formatMoney(value) { return new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 2 }).format(Number(value) || 0) }
function normalizeFeeInput(value) { let v = String(value ?? '').replace(',', '.').replace(/[^\d.]/g, ''); const dot = v.indexOf('.'); if (dot >= 0) v = `${v.slice(0, dot) || '0'}.${v.slice(dot + 1).replace(/\./g, '').slice(0, 2)}`; return v }
function statusBadgeClass(value) { const v = String(value || '').toLowerCase(); return v === 'active' ? 'badge--active' : v === 'closed' ? 'badge--closed' : 'badge--default' }
function statusLabel(value) { const v = String(value || '').toLowerCase(); return v === 'active' ? 'เปิดอยู่' : v === 'closed' ? 'ปิดแล้ว' : value }
function stateKey(product) { return `${selectedRound.value?.round_key || ''}|${product.prod_id}|${product.fee_segment || 'Main'}` }
function aggregateInputKey(product) { return `${stateKey(product)}|aggregate` }
function groupInputKey(product, groupId) { return `${stateKey(product)}|group|${groupId}` }
function feeValue(key, fallback = 0) { const raw = feeInputs.value[key]; return raw === undefined || raw === '' ? Number(fallback) || 0 : Math.max(Number(raw) || 0, 0) }
function authHeaders() { const user = currentUser.value || {}; return { 'Content-Type': 'application/json', 'x-user-role': String(user.role || '').toLowerCase() || 'admin', 'x-user-id': String(user.user_id || user.id || '') } }

function buildBaseProducts(round) {
  const products = new Map()
  for (const raw of round?.products || []) {
    const productKey = String(raw.prod_id), packSize = normalizePackSize(raw.pack_size)
    const optionKey = raw.option_key || raw.key || `${raw.prod_id}|${String(raw.flavor || '').trim().toLowerCase()}|${packSize}|${String(raw.fee_segment || 'Main').toLowerCase()}`
    if (!products.has(productKey)) products.set(productKey, { key: productKey, prod_id: raw.prod_id, product_name: raw.product_name, image_url: raw.image_url || '', fee_segment: raw.fee_segment || round.fee_segment || 'Main', items: [], packs: new Map(), import_fee_mode: raw.import_fee_mode || 'aggregate', import_fee_groups: raw.import_fee_groups || [] })
    const product = products.get(productKey)
    const item = { ...raw, option_key: optionKey, flavorDisplay: raw.flavor || '', ordered_qty: Number(raw.total_sold_qty) || 0, total_received_qty: Number(raw.total_received_qty) || 0, current_import_fee: Number(raw.current_import_fee) || 0, pack_size: packSize, arrival_status: normalizeArrivalStatus(raw.arrival_status), canEnterImportFee: normalizeArrivalStatus(raw.arrival_status) === 'Arrived' && (Number(raw.total_received_qty) || 0) >= (Number(raw.total_sold_qty) || 0) }
    product.items.push(item)
    if (!product.packs.has(packSize)) product.packs.set(packSize, { key: `${productKey}|${packSize}`, pack_size: packSize, items: [] })
    product.packs.get(packSize).items.push(item)
  }
  return [...products.values()]
}

const baseProducts = computed(() => buildBaseProducts(selectedRound.value))
function recommendedGroups(product) {
  const packGroups = [...product.packs.values()]
  const splitUnspecified = packGroups.length === 1 && packGroups[0].pack_size === '__unspecified__' && packGroups[0].items.length > 1
  const sourceGroups = splitUnspecified ? packGroups[0].items.map((item, index) => ({ label: item.flavorDisplay || `ตัวเลือก ${index + 1}`, items: [item] })) : packGroups.map((group) => ({ label: packLabel(group.pack_size), items: group.items }))
  return sourceGroups.map((group, index) => ({ group_id: `group-${index + 1}`, label: group.label, option_keys: group.items.map((item) => item.option_key) }))
}
function sanitizeGroups(product, savedGroups) {
  const available = new Set(product.items.map((item) => item.option_key))
  const groups = Array.isArray(savedGroups) ? savedGroups : []
  if (!groups.length) return recommendedGroups(product)
  const normalized = groups.map((group, index) => ({ group_id: String(group.group_id || group.id || `group-${index + 1}`), label: String(group.label || group.name || `กลุ่ม ${index + 1}`), option_keys: [...new Set((Array.isArray(group.option_keys) ? group.option_keys : []).filter((key) => available.has(key)))] })).filter((group) => group.option_keys.length > 0)
  return normalized.length ? normalized : recommendedGroups(product)
}
function getMode(product) { return modeDrafts.value[stateKey(product)] || product.import_fee_mode || 'aggregate' }
function getDraftGroups(product) { return groupDrafts.value[stateKey(product)] || recommendedGroups(product) }
function groupIdForOption(product, optionKey) { return getDraftGroups(product).find((group) => group.option_keys.includes(optionKey))?.group_id || '' }
function groupItems(product, group) { const keys = new Set(group.option_keys); return product.items.filter((item) => keys.has(item.option_key)) }
function makeGroupSummary(product, group) { const items = groupItems(product, group), eligibleItems = items.filter((item) => item.canEnterImportFee), totalQty = eligibleItems.reduce((sum, item) => sum + item.ordered_qty, 0), currentFee = eligibleItems.reduce((sum, item) => sum + item.current_import_fee, 0), totalFee = feeValue(groupInputKey(product, group.group_id), currentFee); return { ...group, items, totalQty, currentFee, totalFee, averageFee: totalQty > 0 ? totalFee / totalQty : 0, customerCount: Math.max(...items.map((item) => Number(item.customer_count) || 0), 0) } }

const primaryProducts = computed(() => baseProducts.value.map((product) => {
  const mode = getMode(product), eligibleItems = product.items.filter((item) => item.canEnterImportFee), totalQty = eligibleItems.reduce((sum, item) => sum + item.ordered_qty, 0), currentFee = eligibleItems.reduce((sum, item) => sum + item.current_import_fee, 0)
  const suggestedGroups = [...product.packs.values()].map((group) => ({ ...group, totalQty: group.items.filter((item) => item.canEnterImportFee).reduce((sum, item) => sum + item.ordered_qty, 0), customerCount: Math.max(...group.items.map((item) => Number(item.customer_count) || 0), 0) }))
  const separateGroups = getDraftGroups(product).filter((group) => group.option_keys.length > 0).map((group) => makeGroupSummary(product, group))
  const totalFee = mode === 'separate' ? separateGroups.reduce((sum, group) => sum + group.totalFee, 0) : feeValue(aggregateInputKey(product), currentFee)
  return { ...product, mode, suggestedGroups, separateGroups, totalQty, totalFee, currentFee, averageFee: totalQty > 0 ? totalFee / totalQty : 0, hasMultiplePackSizes: suggestedGroups.length > 1, variantCount: product.items.length, customerCount: Math.max(...product.items.map((item) => Number(item.customer_count) || 0), 0) }
}))
const hasUnspecifiedPackSize = computed(() => primaryProducts.value.some((product) => product.suggestedGroups.some((group) => group.pack_size === '__unspecified__')))
const unassignedItems = (product) => product.items.filter((item) => item.ordered_qty > 0 && !groupIdForOption(product, item.option_key))
const hasUnassignedItems = computed(() => primaryProducts.value.some((product) => product.mode === 'separate' && unassignedItems(product).length > 0))
const previewRows = computed(() => primaryProducts.value.flatMap((product) => product.mode === 'aggregate' ? [{ key: `${product.key}|aggregate`, product_name: product.product_name, label: 'รวมทั้งโพสต์', totalQty: product.totalQty, fee: product.totalFee, averageFee: product.averageFee }] : product.separateGroups.map((group) => ({ key: `${product.key}|${group.group_id}`, product_name: product.product_name, label: group.label, totalQty: group.totalQty, fee: group.totalFee, averageFee: group.averageFee }))))
const previewTotal = computed(() => previewRows.value.reduce((sum, row) => sum + row.fee, 0))

function setDraftGroups(product, groups) { groupDrafts.value[stateKey(product)] = groups }
function onModeToggle(product, event) { const nextMode = event.target.checked ? 'separate' : 'aggregate'; if (hasSavedImportFee.value && isEditMode.value && !window.confirm('การเปลี่ยนโหมดจะคำนวณยอดใหม่เมื่อกดยืนยันบันทึก และอาจกระทบยอดที่ยังไม่ชำระ ยืนยันหรือไม่?')) { event.target.checked = getMode(product) === 'separate'; return }; modeDrafts.value[stateKey(product)] = nextMode; if (nextMode === 'separate' && !groupDrafts.value[stateKey(product)]) setDraftGroups(product, recommendedGroups(product)); nextTick(() => { const groups = getDraftGroups(product); if (nextMode === 'separate') for (const group of groups) if (feeInputs.value[groupInputKey(product, group.group_id)] === undefined) feeInputs.value[groupInputKey(product, group.group_id)] = '0'; if (nextMode === 'aggregate' && feeInputs.value[aggregateInputKey(product)] === undefined) feeInputs.value[aggregateInputKey(product)] = String(product.currentFee) }) }
function updateGroupLabel(product, groupId, event) { setDraftGroups(product, getDraftGroups(product).map((group) => group.group_id === groupId ? { ...group, label: event.target.value } : group)) }
function assignOption(product, optionKey, groupId) { setDraftGroups(product, getDraftGroups(product).map((group) => ({ ...group, option_keys: group.group_id === groupId ? [...new Set([...group.option_keys.filter((key) => key !== optionKey), optionKey])] : group.option_keys.filter((key) => key !== optionKey) }))) }
function onFeeInput(key, event) { feeInputs.value[key] = normalizeFeeInput(event?.target?.value) }
function onFeeInputBlur(key) { if (!String(feeInputs.value[key] ?? '').trim() || feeInputs.value[key] === '.') feeInputs.value[key] = '0' }
function isExpanded(key) { return expandedProductKeys.value.has(key) }
function toggleExpanded(key) { const next = new Set(expandedProductKeys.value); if (next.has(key)) next.delete(key); else next.add(key); expandedProductKeys.value = next }
function openImagePreview(url, title) { if (url) previewImage.value = { url, title } }
function closeImagePreview() { previewImage.value = null }

function initializeDrafts() {
  feeInputs.value = {}; modeDrafts.value = {}; groupDrafts.value = {}
  for (const product of baseProducts.value) {
    const key = stateKey(product), mode = product.import_fee_mode === 'separate' ? 'separate' : 'aggregate', groups = mode === 'separate' ? sanitizeGroups(product, product.import_fee_groups) : recommendedGroups(product)
    modeDrafts.value[key] = mode; groupDrafts.value[key] = groups
    feeInputs.value[aggregateInputKey(product)] = String(product.items.filter((item) => item.canEnterImportFee).reduce((sum, item) => sum + item.current_import_fee, 0))
    for (const group of groups) feeInputs.value[groupInputKey(product, group.group_id)] = String(groupItems(product, group).filter((item) => item.canEnterImportFee).reduce((sum, item) => sum + item.current_import_fee, 0))
  }
}

function requestEdit() { if (!hasSavedImportFee.value || isEditMode.value) return; if (!window.confirm('ยืนยันการแก้ไขโหมดหรือค่านำเข้า? ระบบจะแสดงยอดใหม่ก่อนบันทึก')) return; isEditMode.value = true; successMessage.value = ''; errorMessage.value = '' }
function buildFeePayload() {
  if (hasUnassignedItems.value) throw new Error('กรุณาจัดตัวเลือกที่มียอดสั่งจริงเข้ากลุ่มให้ครบก่อนบันทึก')
  const fees = [], mode_configs = []
  for (const product of primaryProducts.value) {
    const groups = getDraftGroups(product).filter((group) => group.option_keys.length > 0).map((group) => ({ group_id: group.group_id, label: String(group.label || '').trim(), option_keys: [...group.option_keys] }))
    if (product.mode === 'aggregate') fees.push({ prod_id: product.prod_id, mode: 'aggregate', group_id: 'aggregate', arrival_status: 'Arrived', fee_segment: product.fee_segment, import_fee: Math.round(product.totalFee * 100) / 100 })
    else for (const group of product.separateGroups) { if (!group.label.trim()) throw new Error(`กรุณาระบุชื่อกลุ่มของ ${product.product_name}`); const raw = feeInputs.value[groupInputKey(product, group.group_id)]; if (group.totalQty > 0 && (raw === '' || raw == null || raw === '.' || !Number.isFinite(Number(raw)) || Number(raw) < 0)) throw new Error(`กรุณากรอกค่านำเข้าของ ${product.product_name} (${group.label})`); fees.push({ prod_id: product.prod_id, mode: 'separate', group_id: group.group_id, arrival_status: 'Arrived', fee_segment: product.fee_segment, import_fee: Math.round(group.totalFee * 100) / 100 }) }
    mode_configs.push({ prod_id: product.prod_id, fee_segment: product.fee_segment, mode: product.mode, groups: product.mode === 'separate' ? groups : [] })
  }
  return { fees, mode_configs }
}
function openSavePreview() { errorMessage.value = ''; try { buildFeePayload(); showPreview.value = true } catch (error) { errorMessage.value = error.message } }
async function fetchRounds() { loading.value = true; errorMessage.value = ''; try { const response = await fetch(`${API_BASE_URL}/admin/preorder-import-fee/rounds`, { headers: authHeaders() }); if (!response.ok) throw new Error(`โหลดรอบพรีออเดอร์ไม่สำเร็จ (${response.status})`); const data = await response.json(); rounds.value = data.filter((round) => /^missing(-\d+)?$/.test(String(round.fee_segment || 'Main').toLowerCase()) || String(round.fee_segment || 'Main').toLowerCase() === 'main'); if (!rounds.value.some((round) => round.round_key === selectedRoundId.value)) selectedRoundId.value = rounds.value[0]?.round_key || '' } catch (error) { errorMessage.value = translateError(error) } finally { loading.value = false } }
async function saveImportFees() { if (!selectedRound.value || isRoundLocked.value) return; try { const payload = buildFeePayload(); saving.value = true; showPreview.value = false; errorMessage.value = ''; successMessage.value = ''; const response = await fetch(`${API_BASE_URL}/admin/preorder-import-fee/${selectedRound.value.round_id}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ...payload, segment: String(selectedRound.value.fee_segment || '').startsWith('Missing') ? selectedRound.value.arrival_status : 'Arrived', fee_segment: selectedRound.value.fee_segment || 'Main' }) }); const data = await response.json().catch(() => ({})); if (!response.ok || !data.success) throw new Error(data.message || `บันทึกค่านำเข้าไม่สำเร็จ (${response.status})`); successMessage.value = data.message || 'บันทึกค่านำเข้าเรียบร้อย'; isEditMode.value = false; await fetchRounds() } catch (error) { errorMessage.value = translateError(error) } finally { saving.value = false } }
function onKeydown(event) { if (event.key === 'Escape') { showPreview.value = false; closeImagePreview() } }
watch(selectedRound, () => { isEditMode.value = false; showPreview.value = false; expandedProductKeys.value = new Set(); successMessage.value = ''; errorMessage.value = ''; initializeDrafts() }, { immediate: true })
onMounted(() => { fetchRounds(); window.addEventListener('meowverse:inventory-intake-updated', fetchRounds); window.addEventListener('keydown', onKeydown) })
onUnmounted(() => { window.removeEventListener('meowverse:inventory-intake-updated', fetchRounds); window.removeEventListener('keydown', onKeydown) })
</script>

<style scoped>
.import-fee-page{padding:1.5rem 1.75rem;width:100%;box-sizing:border-box}.card{background:#fff;border:1px solid #ede9f8;border-radius:14px;padding:1.25rem 1.5rem;margin-bottom:1.25rem}.selector-card{display:flex;flex-direction:column;gap:10px}.field-label{font-size:.8125rem;font-weight:700;color:#6b7280}.select-row{display:flex;align-items:center;gap:12px}.select-wrap{position:relative;flex:1;max-width:420px}.round-select{width:100%;appearance:none;background:#faf9ff;border:1.5px solid #ddd6fe;border-radius:10px;padding:.6rem 2.25rem .6rem .875rem;font-size:.9375rem;color:#1a1a2e;outline:none}.select-chevron{position:absolute;right:10px;top:50%;transform:translateY(-50%);pointer-events:none;color:#9ca3af}.round-badge{display:inline-flex;padding:4px 12px;border-radius:20px;font-size:.8125rem;font-weight:700}.badge--active{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.badge--closed{background:#fef3c7;color:#92400e;border:1px solid #fde68a}.badge--default{background:#f3f4f6;color:#374151;border:1px solid #e5e7eb}.table-card{padding:0;overflow:hidden}.table-header{display:flex;align-items:center;justify-content:space-between;padding:1rem 1.5rem;border-bottom:1px solid #f3f0fb}.table-title{font-size:.9375rem;color:#374151}.table-title b{color:#1a1a2e}.table-hint{margin:.3rem 0 0;color:#9ca3af;font-size:.8rem}.table-count{font-size:.8125rem;color:#6b7280;background:#f9fafb;border:1px solid #e5e7eb;border-radius:20px;padding:3px 10px;white-space:nowrap}.product-list{padding:.75rem}.product-card{border:1px solid #eee8fa;border-radius:14px;overflow:hidden;margin-bottom:.75rem;background:#fff}.product-card--expanded{border-color:#c4b5fd;box-shadow:0 5px 18px rgba(91,33,182,.08)}.product-main-row{display:grid;grid-template-columns:minmax(240px,1.7fr) minmax(110px,.7fr) minmax(145px,.9fr) minmax(150px,1fr) minmax(130px,.9fr) auto;gap:1rem;align-items:center;padding:1rem 1.15rem}.product-cell{display:flex;align-items:center;gap:.7rem;min-width:0}.product-cell-thumb{width:48px;height:48px;border-radius:11px;object-fit:cover;flex:0 0 auto;background:#f5efff}.product-cell-thumb--placeholder{display:grid;place-items:center}.thumb-btn{padding:0;border:0;background:none;cursor:zoom-in;line-height:0;border-radius:11px}.product-copy{min-width:0}.product-name{font-weight:800;color:#1a1a2e;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.product-code{color:#8a789f;font-size:.75rem;margin-top:.25rem}.main-metric{display:flex;flex-direction:column;gap:.25rem;color:#8a789f;font-size:.75rem}.main-metric strong,.main-fee-total{color:#31224d;font-size:.95rem;font-variant-numeric:tabular-nums}.main-metric--fee{align-items:flex-start}.fee-input-wrap{display:inline-flex;align-items:center;background:#fff;border:1.5px solid #e5e7eb;border-radius:8px;overflow:hidden}.fee-input-wrap:focus-within{border-color:#7c3aed;box-shadow:0 0 0 3px rgba(124,58,237,.1)}.fee-prefix{padding:0 6px 0 10px;color:#9ca3af}.fee-input{width:82px;border:0;outline:0;padding:.45rem .5rem .45rem 0;font-size:.9375rem;text-align:right;color:#1a1a2e;background:transparent;font-variant-numeric:tabular-nums}.fee-input:disabled{opacity:.55}.mode-switch{display:flex;align-items:center;gap:.45rem;color:#6d28d9;font-size:.78rem;font-weight:800}.mode-switch input{accent-color:#7c3aed;width:17px;height:17px}.dropdown-btn{display:inline-flex;align-items:center;gap:.4rem;border:1px solid #ddd6fe;background:#faf9ff;color:#6d28d9;border-radius:9px;padding:.5rem .75rem;font-weight:700;cursor:pointer;white-space:nowrap}.dropdown-chevron{font-size:1rem;transition:transform .15s}.dropdown-chevron--open{transform:rotate(180deg)}.detail-panel{padding:0 1.15rem 1.15rem;background:#fcfbff;border-top:1px solid #f0ebfa}.detail-panel-head{display:flex;justify-content:space-between;gap:1rem;padding:.9rem 0;color:#4c3b68}.detail-panel-head div{display:flex;flex-direction:column;gap:.2rem}.detail-panel-head span{font-size:.78rem;color:#9ca3af}.detail-total{font-weight:700;white-space:nowrap}.pack-group{border:1px solid #eadcf6;border-radius:11px;background:#fff;padding:.8rem;margin-top:.7rem}.pack-group-head{display:flex;align-items:center;justify-content:space-between;gap:1rem}.pack-group-head--editable{align-items:flex-start}.group-name-wrap{display:flex;flex-direction:column;gap:.35rem;min-width:0}.group-name-input{min-width:180px;border:1px solid #ddd6fe;border-radius:7px;padding:.35rem .5rem;color:#31224d;font-weight:800}.pack-chip{display:inline-flex;border-radius:999px;background:#f0edfd;color:#5b21b6;padding:4px 9px;font-size:.78rem;font-weight:800}.pack-subtitle{margin-left:.5rem;color:#8a789f;font-size:.78rem}.pack-readonly-fee,.group-fee-row{color:#8a789f;font-size:.78rem}.group-fee-row{display:flex;align-items:center;justify-content:space-between;gap:.8rem;border-top:1px solid #f3f0fb;padding-top:.65rem;margin-top:.65rem}.fee-locked-chip{display:inline-flex;padding:.45rem .7rem;border-radius:8px;background:#f3f4f6;color:#6b7280;font-weight:700}.group-delete{border:0;background:#fff1f2;color:#be123c;border-radius:7px;padding:.35rem .55rem;font-size:.75rem;cursor:pointer}.flavor-list{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:.45rem;margin-top:.7rem}.flavor-row{display:flex;justify-content:space-between;gap:.5rem;padding:.45rem .55rem;border-radius:8px;background:#faf9ff;color:#4c3b68;font-size:.82rem}.flavor-row--assign{align-items:center}.flavor-row small{color:#9ca3af}.flavor-tag{display:inline-block;background:#f5f0ff;color:#6d28d9;border-radius:6px;padding:2px 7px;font-size:.75rem}.assign-control{display:flex;align-items:center;gap:.4rem;white-space:nowrap}.assign-control select{max-width:130px;border:1px solid #ddd6fe;border-radius:6px;padding:.25rem;background:#fff;color:#4c3b68}.btn-add-group{margin-top:.7rem;border:1px dashed #a78bfa;background:#faf9ff;color:#6d28d9;border-radius:8px;padding:.45rem .75rem;font-weight:700;cursor:pointer}.note-warning{padding:.8rem 1.5rem;background:#fffbeb;border-top:1px solid #fde68a;color:#92400e;font-size:.82rem}.note-warning--info{background:#f0f9ff;border-top-color:#bae6fd;color:#075985}.note-warning--danger{margin-top:.7rem;background:#fff1f2;border-top-color:#fecdd3;color:#9f1239}.actions{display:flex;align-items:center;gap:12px;padding:1rem 1.5rem;border-top:1px solid #f3f0fb;flex-wrap:wrap}.btn-save,.btn-edit{display:inline-flex;align-items:center;justify-content:center;gap:7px;padding:.55rem 1.25rem;border-radius:9px;font-size:.9rem;font-weight:700;cursor:pointer}.btn-save{background:#b53ee4;color:#fff;border:0;box-shadow:0 2px 8px rgba(124,58,237,.25)}.btn-edit{background:#fff;color:#7c3aed;border:1.5px solid #c4b5fd}.btn-save:disabled,.btn-edit:disabled{opacity:.6;cursor:not-allowed}.toast{display:inline-flex;padding:.45rem 1rem;border-radius:8px;font-size:.875rem}.toast--success{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.toast--error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.empty-state{display:flex;justify-content:center;padding:3rem 1rem;color:#9ca3af}.spinner{display:inline-block;width:18px;height:18px;border:2px solid rgba(124,58,237,.2);border-top-color:#7c3ce9;border-radius:50%;animation:spin .7s linear infinite}@keyframes spin{to{transform:rotate(360deg)}}.modal-overlay{position:fixed;inset:0;background:rgba(44,36,64,.55);display:flex;align-items:center;justify-content:center;padding:1rem;z-index:50}.image-modal-card,.preview-modal-card{width:min(620px,100%);max-height:90vh;overflow:auto;background:#fff;border-radius:20px;padding:1.1rem;position:relative}.image-modal-card{text-align:center}.image-modal-close{position:absolute;top:.6rem;right:.6rem;width:32px;height:32px;border-radius:50%;border:1px solid #eadcf6;background:#fff;color:#5b21b6;cursor:pointer}.image-modal-img{width:100%;max-height:70vh;object-fit:contain;border-radius:14px;background:#f5efff}.image-modal-caption{margin:.75rem 0 0;color:#3f2f5d;font-weight:700}.preview-modal-head{display:flex;justify-content:space-between;gap:2rem;border-bottom:1px solid #eee8fa;padding-bottom:.8rem}.preview-modal-head h2{margin:0;color:#31224d;font-size:1.1rem}.preview-modal-head p{margin:.35rem 0 0;color:#8a789f;font-size:.8rem}.preview-list{max-height:45vh;overflow:auto;margin:1rem 0}.preview-row{display:flex;justify-content:space-between;gap:1rem;padding:.75rem 0;border-bottom:1px solid #f3f0fb}.preview-row div:first-child{display:flex;flex-direction:column;gap:.2rem}.preview-row span,.preview-amount small{color:#8a789f;font-size:.78rem}.preview-amount{display:flex;flex-direction:column;text-align:right}.preview-total{display:flex;justify-content:space-between;align-items:center;padding:.85rem 0;border-top:1px solid #eadcf6;color:#4c3b68}.preview-total strong{font-size:1.2rem;color:#6d28d9}.preview-actions{display:flex;justify-content:flex-end;gap:.6rem}@media(max-width:1100px){.product-main-row{grid-template-columns:minmax(220px,1.5fr) minmax(100px,.7fr) minmax(130px,.9fr) minmax(130px,.9fr) auto}.main-metric:nth-of-type(5){display:none}}@media(max-width:720px){.import-fee-page{padding:1rem}.table-header{align-items:flex-start;gap:.5rem;flex-direction:column}.product-main-row{grid-template-columns:1fr auto;gap:.7rem}.main-metric,.mode-switch{grid-column:span 1}.main-metric--fee{grid-column:1}.mode-switch{grid-column:2;grid-row:2}.dropdown-btn{grid-column:2;grid-row:3}.pack-group-head,.detail-panel-head,.group-fee-row{align-items:flex-start;flex-direction:column}.group-fee-row .fee-input-wrap{align-self:flex-end}.flavor-row--assign{align-items:flex-start;flex-direction:column}.assign-control{width:100%;justify-content:space-between}.assign-control select{max-width:none;flex:1}.actions{padding:1rem}.btn-save,.btn-edit{width:100%}.preview-actions{flex-direction:column}.preview-actions button{width:100%}}
.unassigned-panel{margin-top:.8rem;padding:.8rem;border:1px solid #fecdd3;border-radius:10px;background:#fff1f2;color:#9f1239}.unassigned-panel strong{display:block;margin-bottom:.45rem}.unassigned-panel .flavor-row{background:#fff}
</style>
