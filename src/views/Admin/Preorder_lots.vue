<template>
  <div class="preorder-container">
    <div class="preorder-header">
      <h1>รอบนำเข้าสินค้า</h1>
      <p class="subtitle">รายการรอบนำเข้าสินค้าพรีออเดอร์ Meowverse Pet Shop</p>
      <button class="btn-add-round" @click="openCreateRoundModal">
        + เพิ่มรอบนำเข้าสินค้าแอดมิน
      </button>
    </div>

    <div class="preorder-content" v-if="!isLoading">
      <div v-if="preorderRounds.length === 0" class="empty-state">
        <p>ยังไม่มีรอบนำเข้าสินค้าที่สร้าง กรุณาสร้างรอบนำเข้าใหม่</p>
      </div>

      <table v-else class="preorder-table">
        <thead>
          <tr>
            <th>ชื่อรอบ</th>
            <th>รายละเอียด</th>
            <th>วันเริ่ม</th>
            <th>วันสิ้นสุด</th>
            <th>สถานะ</th>
            <th>การกระทำ</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="round in preorderRounds" :key="round.id">
            <td>{{ round.name }}</td>
            <td class="project-column">{{ round.description || '-' }}</td>
            <td>{{ formatDate(round.startDate) }}</td>
            <td>{{ formatDate(round.endDate) }}</td>
            <td>
              <span :class="['status-badge', getStatusClass(round.status)]">
                {{ getStatusLabel(round.status) }}
              </span>
            </td>
            <td class="actions">
              <button class="btn-action" @click="openRoundDetailModal(round)">รายละเอียด</button>
              <button class="btn-action" @click="openEditRoundModal(round)">แก้ไข</button>
              <button
                class="btn-action"
                :class="['active', 'open'].includes(String(round.status || '').toLowerCase()) ? 'danger' : 'success'"
                @click="toggleRoundStatus(round)"
              >
                {{ ['active', 'open'].includes(String(round.status || '').toLowerCase()) ? 'ปิดรอบ' : 'เปิดรอบ' }}
              </button>
              <button class="btn-action danger" @click="deleteRound(round.id)">ลบ</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div v-else class="loading">
      <p>กำลังโหลด...</p>
    </div>

    <!-- Create/Edit Round Modal -->
    <div v-if="showRoundModal" class="modal-overlay" @click.self="closeRoundModal">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingRound ? 'แก้ไขรอบนำเข้าสินค้า' : 'สร้างรอบนำเข้าสินค้าใหม่' }}</h2>
          <button class="close-btn" @click="closeRoundModal">×</button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="saveRound">
            <div class="form-group">
              <label for="round-name">ชื่อรอบ *</label>
              <input
                id="round-name"
                v-model="roundForm.name"
                type="text"
                required
                placeholder="เช่น MOKO มีนาคม 2026"
              />
            </div>

            <div class="form-group">
              <label for="round-description">รายละเอียด</label>
              <textarea
                id="round-description"
                v-model="roundForm.description"
                rows="3"
                placeholder="เช่น สินค้านำเข้าล็อตเดือนเมษายน"
              ></textarea>
            </div>

            <div class="form-group">
              <label for="round-start-date">วันเปิด *</label>
              <input
                id="round-start-date"
                v-model="roundForm.startDate"
                type="datetime-local"
                required
              />
            </div>

            <div class="form-group">
              <label for="round-end-date">วันปิด *</label>
              <input
                id="round-end-date"
                v-model="roundForm.endDate"
                type="datetime-local"
                required
              />
            </div>

            <div class="form-group">
              <label for="round-status">สถานะ</label>
              <select id="round-status" v-model="roundForm.status">
                <option value="active">เปิด</option>
                <option value="closed">ปิด</option>
                <option value="archived">เก็บถาวร</option>
              </select>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-cancel" @click="closeRoundModal">ยกเลิก</button>
              <button type="submit" class="btn-submit">{{ editingRound ? 'บันทึก' : 'สร้าง' }}</button>
            </div>
          </form>
        </div>

        <div v-if="editingRound && currentRound" class="modal-footer">
          <button class="btn-add-products" @click="openAddProductsModal">
            + เพิ่มสินค้า
          </button>
        </div>
      </div>
    </div>

    <!-- Edit Round with Products Modal -->
    <div v-if="showEditRoundModal && currentRound" class="modal-overlay" @click.self="closeEditRoundModal">
      <div class="modal modal-large">
        <div class="modal-header">
          <h2>{{ currentRound.name }}</h2>
          <button class="close-btn" @click="closeEditRoundModal">×</button>
        </div>

        <div class="modal-body">
          <div class="round-details">
            <div class="detail-group">
              <label>วันเปิด</label>
              <span>{{ formatDate(currentRound.startDate) }}</span>
            </div>
            <div class="detail-group">
              <label>วันปิด</label>
              <span>{{ formatDate(currentRound.endDate) }}</span>
            </div>
            <div class="detail-group">
              <label>สถานะ</label>
              <span :class="['status-badge', getStatusClass(currentRound.status)]">
                {{ getStatusLabel(currentRound.status) }}
              </span>
            </div>
            <div v-if="currentRound.description" class="detail-group detail-group--full">
              <label>รายละเอียด</label>
              <span>{{ currentRound.description }}</span>
            </div>
          </div>

          <div class="products-section">
            <div class="products-header">
              <h3>สินค้าในรอบ</h3>
              <button class="btn-add-products-small" @click="openAddProductsModal">
                + เพิ่มสินค้า
              </button>
            </div>

            <div v-if="!currentRound.products || currentRound.products.length === 0" class="empty-products">
              <p>ยังไม่มีสินค้าในรอบนี้</p>
            </div>

            <div v-else class="products-grid">
              <div v-for="product in currentRound.products" :key="product.id" class="product-item">
                <div class="product-image">
                  <img
                    v-if="product.imageUrls && product.imageUrls[0]"
                    :src="product.imageUrls[0]"
                    :alt="product.name"
                  />
                  <div v-else class="no-image">ไม่มีรูป</div>
                </div>
                <div class="product-info">
                  <h4>{{ product.name }}</h4>
                  <p class="sku">SKU: {{ product.sku || '-' }}</p>
                  <p class="category">{{ product.categoryName || '-' }}</p>
                  <div class="price-section">
                    <span class="price-label">ราคาพื้นฐาน:</span>
                    <span class="price">{{ formatPrice(product.basePrice) }}</span>
                  </div>
                  <div class="quantity-section">
                    <span class="quantity-label">จำนวนคงเหลือ</span>
                    <span class="quantity-value">{{ product.quantityAvailable }}</span>
                    <div class="quantity-edit">
                      <input
                        type="number"
                        min="0"
                        :value="productQuantityChanges[product.id] ?? product.quantityAvailable"
                        @input="updateProductQuantity(product.id, $event.target.value)"
                        class="quantity-input-field"
                      />
                      <button
                        class="btn-save-quantity"
                        @click="saveProductQuantity(product.id)"
                        :disabled="!hasQuantityChanged(product.id)"
                      >
                        บันทึก
                      </button>
                    </div>
                  </div>
                  <button class="btn-detail" @click="openProductDetailModal(product)">ดูรายละเอียด</button>
                </div>
                <button
                  class="btn-remove"
                  @click="removeProduct(product.id)"
                  title="ลบสินค้านี้จากรอบ"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add Products Modal -->
    <div v-if="showAddProductsModal && currentRound" class="modal-overlay" @click.self="closeAddProductsModal">
      <div class="modal modal-large">
        <div class="modal-header">
          <h2>เพิ่มสินค้าไปในรอบ {{ currentRound.name }}</h2>
          <button class="close-btn" @click="closeAddProductsModal">×</button>
        </div>

        <div class="modal-body">
          <div class="add-products-content">
            <div class="search-section">
              <input
                v-model="searchQuery"
                type="text"
                placeholder="ค้นหาสินค้า..."
                class="search-input"
              />
            </div>

            <div v-if="filteredAvailableProducts.length === 0" class="empty-search">
              <p>ไม่พบสินค้าที่ตรงกับการค้นหา</p>
            </div>

            <div v-else class="products-list">
              <div v-for="product in filteredAvailableProducts" :key="product.id" class="product-selection">
                <div class="product-selection-header">
                  <label class="product-checkbox">
                    <input
                      type="checkbox"
                      :checked="selectedProductIds.includes(product.id)"
                      @change="toggleProductSelection(product.id)"
                    />
                    <span class="checkmark"></span>
                    <span class="product-label">{{ product.name }}</span>
                  </label>
                  <div v-if="selectedProductIds.includes(product.id)" class="quantity-input">
                    <label>จำนวน:</label>
                    <input
                      type="number"
                      min="1"
                      v-model.number="selectedProductQuantities[product.id]"
                      class="quantity-field"
                    />
                  </div>
                </div>
                <div class="product-meta">
                  <span class="sku">SKU: {{ product.sku || '-' }}</span>
                  <span class="category">{{ product.categoryName || '-' }}</span>
                  <span class="price">฿{{ formatPrice(product.basePrice) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div class="form-actions">
            <button type="button" class="btn-cancel" @click="closeAddProductsModal">ยกเลิก</button>
            <button
              type="button"
              class="btn-submit"
              :disabled="selectedProductIds.length === 0"
              @click="confirmAddProducts"
            >
              เพิ่มสินค้า ({{ selectedProductIds.length }})
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Product Detail Modal -->
    <div v-if="showProductDetailModal && selectedProduct" class="modal-overlay" @click.self="closeProductDetailModal">
      <div class="modal">
        <div class="modal-header">
          <h2>รายละเอียดสินค้า</h2>
          <button class="close-btn" @click="closeProductDetailModal">×</button>
        </div>

        <div class="modal-body">
          <div class="product-detail">
            <div class="product-image-large">
              <img
                v-if="selectedProduct.imageUrls && selectedProduct.imageUrls[0]"
                :src="selectedProduct.imageUrls[0]"
                :alt="selectedProduct.name"
              />
              <div v-else class="no-image">ไม่มีรูป</div>
            </div>
            <div class="product-info-detail">
              <h3>{{ selectedProduct.name }}</h3>
              <p><strong>SKU:</strong> {{ selectedProduct.sku || '-' }}</p>
              <p><strong>หมวดหมู่:</strong> {{ selectedProduct.categoryName || '-' }}</p>
              <p><strong>ราคาพื้นฐาน:</strong> {{ formatPrice(selectedProduct.basePrice) }} บาท</p>
              <p><strong>จำนวนคงเหลือ:</strong> {{ selectedProduct.quantityAvailable }}</p>
              <div class="quantity-detail-edit">
                <label>แก้ไขจำนวน:</label>
                <input
                  type="number"
                  min="0"
                  :value="productQuantityChanges[selectedProduct.id] ?? selectedProduct.quantityAvailable"
                  @input="updateProductQuantity(selectedProduct.id, $event.target.value)"
                  class="quantity-input-field"
                />
                <button
                  class="btn-save-detail"
                  @click="saveProductQuantity(selectedProduct.id)"
                  :disabled="!hasQuantityChanged(selectedProduct.id)"
                >
                  บันทึก
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, reactive } from 'vue'
import { usePreorderStore } from '@/stores/preorderStore'
import { useAdminProductStore } from '@/stores/adminProductStore'

const preorderStore = usePreorderStore()
const adminProductStore = useAdminProductStore()

const showRoundModal = ref(false)
const showEditRoundModal = ref(false)
const showAddProductsModal = ref(false)
const searchQuery = ref('')
const editingRound = ref(null)
const selectedProductIds = ref([])
const selectedProductQuantities = reactive({})
const productQuantityChanges = reactive({})
const showProductDetailModal = ref(false)
const selectedProduct = ref(null)

const roundForm = ref({
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  status: 'active',
})

const preorderRounds = computed(() => preorderStore.preorderRounds)
const currentRound = computed(() => preorderStore.currentRound)
const isLoading = computed(() => preorderStore.isLoading)
const allProducts = computed(() => adminProductStore.products)

const filteredAvailableProducts = computed(() => {
  const currentProductIds = currentRound.value?.products?.map(p => p.id) || []
  const filtered = allProducts.value.filter(
    p => !currentProductIds.includes(p.id)
  )

  if (!searchQuery.value) return filtered

  const query = searchQuery.value.toLowerCase()
  return filtered.filter(p =>
    p.name.toLowerCase().includes(query) ||
    (p.sku && p.sku.toLowerCase().includes(query))
  )
})

function formatDate(dateString) {
  const date = new Date(dateString)
  return date.toLocaleDateString('th-TH', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatPrice(price) {
  return Number(price).toFixed(2)
}

function getStatusLabel(status) {
  const labels = {
    Open: 'เปิด',
    Closed: 'ปิด',
    Archived: 'เก็บถาวร',
    active: 'เปิด',
  }
  return labels[status] || status
}

function getStatusClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'open' || normalized === 'active') return 'open'
  if (normalized === 'closed') return 'closed'
  if (normalized === 'archived') return 'archived'
  return normalized
}

function openCreateRoundModal() {
  editingRound.value = null
  roundForm.value = {
    name: '',
    description: '',
    startDate: '',
    endDate: '',
    status: 'active',
  }
  showRoundModal.value = true
}

function openEditRoundModal(round) {
  editingRound.value = round
  const normalizedStatus = String(round.status || '').toLowerCase()
  roundForm.value = {
    name: round.name,
    description: round.description || '',
    startDate: round.startDate,
    endDate: round.endDate,
    status: ['active', 'open'].includes(normalizedStatus) ? 'active' : normalizedStatus || 'active',
  }
  showRoundModal.value = true
  preorderStore.fetchRoundDetail(round.id)
}

async function openRoundDetailModal(round) {
  try {
    await preorderStore.fetchRoundDetail(round.id)
    showEditRoundModal.value = true
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

function closeRoundModal() {
  showRoundModal.value = false
  editingRound.value = null
}

function closeEditRoundModal() {
  showEditRoundModal.value = false
}

function openAddProductsModal() {
  searchQuery.value = ''
  selectedProductIds.value = []
  Object.keys(selectedProductQuantities).forEach(key => {
    delete selectedProductQuantities[key]
  })
  showAddProductsModal.value = true
}

function closeAddProductsModal() {
  showAddProductsModal.value = false
  selectedProductIds.value = []
  Object.keys(selectedProductQuantities).forEach(key => {
    delete selectedProductQuantities[key]
  })
}

function openProductDetailModal(product) {
  selectedProduct.value = product
  showProductDetailModal.value = true
}

function closeProductDetailModal() {
  showProductDetailModal.value = false
  selectedProduct.value = null
}

function toggleProductSelection(productId) {
  const index = selectedProductIds.value.indexOf(productId)
  if (index > -1) {
    selectedProductIds.value.splice(index, 1)
    delete selectedProductQuantities[productId]
  } else {
    selectedProductIds.value.push(productId)
    selectedProductQuantities[productId] = 1 // Default quantity
  }
}

function updateProductQuantity(productId, quantity) {
  const qty = Math.max(0, parseInt(quantity) || 0)

  if (selectedProductIds.value.includes(productId)) {
    selectedProductQuantities[productId] = Math.max(1, qty)
    return
  }

  if (currentRound.value?.products) {
    productQuantityChanges[productId] = qty
  }
}

function hasQuantityChanged(productId) {
  if (!currentRound.value?.products) return false
  const product = currentRound.value.products.find(p => String(p.id) === String(productId))
  if (!product) return false
  return Number(productQuantityChanges[productId] ?? product.quantityAvailable) !== Number(product.quantityAvailable)
}

async function saveProductQuantity(productId) {
  if (!currentRound.value) return
  const quantity = productQuantityChanges[productId]
  if (quantity == null) return

  try {
    await preorderStore.updateProductQuantityInRound(currentRound.value.id, productId, quantity)
    delete productQuantityChanges[productId]
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

async function saveRound() {
  try {
    if (editingRound.value) {
      await preorderStore.updateRound(editingRound.value.id, roundForm.value)
      closeRoundModal()
      closeEditRoundModal()
    } else {
      const newRound = await preorderStore.createRound(roundForm.value)
      editingRound.value = newRound
      closeRoundModal()
      await preorderStore.fetchRoundDetail(newRound.id)
      showEditRoundModal.value = true
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

async function confirmAddProducts() {
  try {
    if (selectedProductIds.value.length > 0 && currentRound.value) {
      const quantities = selectedProductIds.value.map(id => selectedProductQuantities[id] || 1)
      await preorderStore.addProductsToRound(currentRound.value.id, selectedProductIds.value, quantities)
      closeAddProductsModal()
    }
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

async function removeProduct(productId) {
  if (confirm('คุณแน่ใจหรือว่าต้องการลบสินค้านี้จากรอบ?')) {
    try {
      if (currentRound.value) {
        await preorderStore.removeProductFromRound(currentRound.value.id, productId)
      }
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    }
  }
}

async function deleteRound(roundId) {
  if (confirm('คุณแน่ใจหรือว่าต้องการลบรอบสินค้านำเข้านี้?')) {
    try {
      await preorderStore.deleteRound(roundId)
    } catch (error) {
      alert('เกิดข้อผิดพลาด: ' + error.message)
    }
  }
}

async function toggleRoundStatus(round) {
  try {
    const statusValue = String(round.status || '').toLowerCase()
    const targetStatus = ['active', 'open'].includes(statusValue) ? 'closed' : 'active'
    await preorderStore.updateRound(round.id, {
      name: round.name,
      description: round.description || '',
      startDate: round.startDate,
      endDate: round.endDate,
      status: targetStatus,
    })
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

onMounted(async () => {
  await preorderStore.fetchRounds()
  await adminProductStore.fetchProducts()
})
</script>

<style scoped>
.preorder-container {
  padding: 20px;
  background: linear-gradient(135deg, #fff4fb 0%, #ffe6f5 100%);
  min-height: 100vh;
}

.preorder-header {
  margin-bottom: 30px;
}

.preorder-header h1 {
  font-size: 32px;
  color: #4c1d5b;
  margin: 0 0 10px 0;
  font-weight: 700;
}

.subtitle {
  color: #7a5a7b;
  margin: 0 0 20px 0;
  font-size: 14px;
}

.btn-add-round {
  background: linear-gradient(135deg, #ff93b8 0%, #f7c8e4 100%);
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.3s ease;
}

.btn-add-round:hover {
  box-shadow: 0 6px 18px rgba(255, 115, 170, 0.25);
  transform: translateY(-2px);
}

.preorder-content {
  background: rgba(255, 245, 253, 0.95);
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 12px 32px rgba(212, 129, 177, 0.12);
}

.empty-state,
.loading {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.preorder-table {
  width: 100%;
  border-collapse: collapse;
}

.preorder-table thead {
  background-color: #f5f5f5;
}

.preorder-table th {
  padding: 12px;
  text-align: left;
  font-weight: 600;
  color: #333;
  border-bottom: 2px solid #e0e0e0;
}

.preorder-table td {
  padding: 12px;
  border-bottom: 1px solid #f0f0f0;
}

.preorder-table tbody tr:hover {
  background-color: #fafafa;
}

.project-column {
  color: #999;
}

.status-badge {
  display: inline-block;
  padding: 4px 12px;
  border-radius: 20px;
  font-size: 12px;
  font-weight: 500;
}

.status-badge.open,
.status-badge.active {
  background-color: #c8e6c9;
  color: #2e7d32;
}

.status-badge.closed {
  background-color: #ffccbc;
  color: #d84315;
}

.status-badge.archived {
  background-color: #e0e0e0;
  color: #666;
}

.actions {
  display: flex;
  gap: 8px;
}

.btn-action {
  background-color: #f0f0f0;
  border: 1px solid #ddd;
  padding: 6px 12px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action:hover {
  background-color: #e0e0e0;
}

..btn-action.danger {
  color: #d32f2f;
}

.btn-action.success {
  color: #1b5e20;
  border-color: #aed581;
}

.btn-action.success:hover {
  background-color: #e8f5e9;
}

.btn-action.danger:hover {
  background-color: #ffebee;
}

/* Modal Styles */
.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 100%;
  max-width: 500px;
  max-height: 90vh;
  overflow-y: auto;
  box-shadow: 0 10px 40px rgba(0, 0, 0, 0.2);
}

.modal-large {
  max-width: 700px;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 20px;
  border-bottom: 1px solid #f0f0f0;
}

.modal-header h2 {
  margin: 0;
  font-size: 20px;
  color: #333;
}

.close-btn {
  background: none;
  border: none;
  font-size: 28px;
  color: #999;
  cursor: pointer;
  padding: 0;
  width: 30px;
  height: 30px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.close-btn:hover {
  color: #333;
}

.modal-body {
  padding: 20px;
}

.modal-footer {
  padding: 20px;
  border-top: 1px solid #f0f0f0;
}

.form-group {
  margin-bottom: 16px;
}

.form-group label {
  display: block;
  margin-bottom: 6px;
  font-weight: 500;
  color: #333;
}

.form-group input,
.form-group select {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.form-group input:focus,
.form-group select:focus {
  outline: none;
  border-color: #b388d4;
  box-shadow: 0 0 0 3px rgba(179, 136, 212, 0.1);
}

.form-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
}

.btn-cancel,
.btn-submit {
  padding: 10px 20px;
  border: none;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-cancel {
  background-color: #f0f0f0;
  color: #333;
}

.btn-cancel:hover {
  background-color: #e0e0e0;
}

.btn-submit {
  background: linear-gradient(135deg, #b388d4 0%, #9d6cb8 100%);
  color: white;
}

.btn-submit:hover:not(:disabled) {
  box-shadow: 0 4px 12px rgba(179, 136, 212, 0.4);
}

.btn-submit:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-add-products,
.btn-add-products-small {
  background: linear-gradient(135deg, #b388d4 0%, #9d6cb8 100%);
  color: white;
  border: none;
  padding: 10px 16px;
  border-radius: 4px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-add-products:hover,
.btn-add-products-small:hover {
  box-shadow: 0 4px 12px rgba(179, 136, 212, 0.4);
}

.btn-add-products-small {
  padding: 8px 14px;
  font-size: 13px;
}

/* Round Details Styles */
.round-details {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 18px;
  margin-bottom: 28px;
  padding: 22px;
  background-color: #fcf7ff;
  border-radius: 24px;
  border: 1px solid rgba(215, 192, 235, 0.9);
  box-shadow: 0 10px 32px rgba(132, 88, 184, 0.08);
}

.detail-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 18px;
  background: #ffffff;
  border-radius: 18px;
  border: 1px solid rgba(228, 216, 237, 0.9);
}

.detail-group--full {
  grid-column: span 2;
}

.detail-group label {
  font-weight: 700;
  color: #674a7f;
  margin: 0;
  font-size: 13px;
}

.detail-group span {
  color: #402b56;
  font-size: 15px;
  line-height: 1.6;
}

/* Products Section */
.products-section {
  margin-top: 24px;
}

.products-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin-bottom: 20px;
}

.products-section h3 {
  margin: 0;
  font-size: 18px;
  color: #3d1f5b;
}

.empty-products {
  text-align: center;
  padding: 40px 20px;
  background-color: #fafafa;
  border-radius: 4px;
  color: #999;
}

.products-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
  gap: 16px;
}

.product-item {
  border: 1px solid #e0e0e0;
  border-radius: 4px;
  padding: 12px;
  position: relative;
  transition: all 0.2s ease;
}

.product-item:hover {
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.product-image {
  width: 100%;
  height: 120px;
  background-color: #f5f5f5;
  border-radius: 4px;
  margin-bottom: 12px;
  overflow: hidden;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 12px;
}

.product-info {
  font-size: 13px;
}

.product-info h4 {
  margin: 0 0 4px 0;
  font-size: 13px;
  color: #333;
  line-height: 1.4;
  max-height: 2.6em;
  overflow: hidden;
  text-overflow: ellipsis;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}

.product-info p {
  margin: 4px 0;
  color: #999;
  font-size: 11px;
}

.price-section,
.quantity-section {
  margin-top: 8px;
  display: flex;
  align-items: flex-start;
  justify-content: flex-start;
  gap: 12px;
  flex-wrap: wrap;
}

.price-label,
.quantity-label {
  color: #6f4d8b;
  font-weight: 600;
}

.quantity-edit {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  margin-left: 0;
  margin-top: 6px;
}

.quantity-input-field {
  width: 110px;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 12px;
  font-size: 13px;
}

.btn-save-quantity {
  padding: 8px 14px;
  border-radius: 12px;
  min-width: 90px;
}

.quantity-value {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 54px;
  padding: 4px 10px;
  border-radius: 999px;
  background-color: #f3e5f5;
  color: #7b1fa2;
  font-size: 13px;
  font-weight: 700;
}

.price,
.quantity {
  font-weight: 600;
  color: #b388d4;
}

.btn-remove {
  position: absolute;
  top: 8px;
  right: 8px;
  background-color: rgba(255, 0, 0, 0.8);
  color: white;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 50%;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  transition: background-color 0.2s ease;
}

.btn-remove:hover {
  background-color: rgba(255, 0, 0, 1);
}

/* Add Products Modal */
.add-products-content {
  margin-bottom: 20px;
}

.search-section {
  margin-bottom: 20px;
}

.search-input {
  width: 100%;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 14px;
}

.search-input:focus {
  outline: none;
  border-color: #b388d4;
  box-shadow: 0 0 0 3px rgba(179, 136, 212, 0.1);
}

.empty-search {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.products-list {
  max-height: 400px;
  overflow-y: auto;
}

.product-selection {
  padding: 12px;
  border: 1px solid #f0f0f0;
  border-radius: 4px;
  margin-bottom: 8px;
  transition: all 0.2s ease;
}

.product-selection:hover {
  background-color: #fafafa;
}

.product-selection-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.product-checkbox {
  display: flex;
  align-items: center;
  cursor: pointer;
  flex: 1;
}

.product-checkbox input {
  margin-right: 10px;
  width: 18px;
  height: 18px;
  cursor: pointer;
}

.checkmark {
  margin-right: 8px;
}

.product-label {
  font-weight: 500;
  color: #333;
  flex: 1;
}

.quantity-input {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: 16px;
}

.quantity-input label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  white-space: nowrap;
}

.quantity-field {
  width: 60px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}

.quantity-field:focus {
  outline: none;
  border-color: #b388d4;
  box-shadow: 0 0 0 2px rgba(179, 136, 212, 0.1);
}

.product-meta {
  display: flex;
  gap: 12px;
  font-size: 12px;
  color: #999;
  margin-left: 28px;
}

.btn-detail {
  background-color: #b388d4;
  color: white;
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 12px;
  cursor: pointer;
  margin-top: 8px;
  transition: background-color 0.2s ease;
}

.btn-detail:hover {
  background-color: #9d6cb8;
}

.quantity-detail-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
}

.quantity-detail-edit label {
  font-size: 13px;
  color: #5e3b77;
  min-width: 84px;
}

.product-detail .quantity-input-field {
  width: 110px;
  padding: 8px 10px;
  border: 1px solid #ddd;
  border-radius: 12px;
  font-size: 13px;
}

.btn-save-detail {
  background: linear-gradient(135deg, #b388d4 0%, #9d6cb8 100%);
  color: white;
  border: none;
  padding: 8px 14px;
  border-radius: 12px;
  font-size: 13px;
  cursor: pointer;
  transition: background-color 0.2s ease;
}

.btn-save-detail:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.btn-save-detail:hover:not(:disabled) {
  background-color: #8c5ca8;
}

.product-detail {
  display: grid;
  grid-template-columns: minmax(220px, 280px) 1fr;
  gap: 24px;
  align-items: start;
}

.product-image-large {
  border-radius: 24px;
  overflow: hidden;
  background: #f7f0ff;
  min-height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-image-large img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.product-info-detail {
  background: #fbf5ff;
  border-radius: 24px;
  padding: 22px;
  border: 1px solid rgba(218, 199, 242, 0.9);
}

.product-info-detail h3 {
  margin-top: 0;
  color: #3c1f59;
  font-size: 22px;
  margin-bottom: 18px;
}

.product-info-detail p {
  margin: 12px 0;
  color: #534264;
  font-size: 15px;
  line-height: 1.7;
}

.product-info-detail p strong {
  color: #382548;
}

/* Responsive */
@media (max-width: 768px) {
  .preorder-container {
    padding: 10px;
  }

  .preorder-table {
    font-size: 13px;
  }

  .preorder-table th,
  .preorder-table td {
    padding: 8px;
  }

  .modal {
    max-width: 95%;
  }

  .modal-large {
    max-width: 95%;
  }

  .products-grid {
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  }

  .actions {
    flex-direction: column;
  }

  .btn-action {
    width: 100%;
  }

  .round-details {
    grid-template-columns: 1fr;
  }
}
</style>
