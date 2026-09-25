<template>
  <div class="preorder-container">
    <AdminPageHeader title="รอบนำเข้าสินค้า" description="รายการรอบนำเข้าสินค้าพรีออเดอร์ Meowverse Pet Shop"><button class="btn-add-round" @click="openCreateRoundModal">
        + สร้างรอบพรีออเดอร์
      </button></AdminPageHeader>

    <div class="preorder-content" v-if="!isLoading">
      <div class="rounds-toolbar">
        <div><h2>รอบพรีออเดอร์ทั้งหมด <span>{{ preorderRounds.length }}</span></h2><p>จัดการกำหนดเวลา สินค้า และสถานะของแต่ละรอบ</p></div>
        <div class="rounds-filters">
          <input v-model="roundSearch" type="search" aria-label="ค้นหารอบพรีออเดอร์" placeholder="ค้นหาชื่อรอบหรือรายละเอียด…" />
          <select v-model="roundStatusFilter" aria-label="กรองสถานะรอบ">
            <option value="all">ทุกสถานะ</option>
            <option value="active">เปิดรับออเดอร์</option>
            <option value="closed">ปิดรอบแล้ว</option>
            <option value="scheduled">ตามกำหนดเวลา</option>
            <option value="archived">เก็บถาวร</option>
          </select>
        </div>
      </div>
      <div v-if="preorderRounds.length === 0" class="empty-state">
        <p>ยังไม่มีรอบนำเข้าสินค้าที่สร้าง กรุณาสร้างรอบนำเข้าใหม่</p>
      </div>

      <div v-else-if="!visibleRounds.length" class="empty-state"><p>ไม่พบรอบที่ตรงกับการค้นหา</p><button class="btn-action" @click="roundSearch = ''; roundStatusFilter = 'all'">ล้างตัวกรอง</button></div>
      <template v-else>
        <!-- Desktop / tablet: preserve the original table layout -->
        <div class="table-scroll-wrap">
          <table class="preorder-table">
            <thead>
              <tr>
                <th>ชื่อรอบ</th>
                <th>รายละเอียด</th>
                <th>วันเริ่ม</th>
                <th>วันสิ้นสุด</th>
                <th>สถานะ</th>
                <th>จัดการรอบ</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="round in visibleRounds" :key="round.id">
                <td><strong class="round-name">{{ round.name }}</strong><small class="round-id">รอบ #{{ round.id }}</small></td>
                <td class="project-column">{{ round.description || '-' }}</td>
                <td>{{ formatDate(round.startDate) }}</td>
                <td>{{ formatDate(round.endDate) }}</td>
                <td>
                  <span :class="['status-badge', getStatusClass(round.status)]">
                    {{ getStatusLabel(round.status) }}
                  </span>
                </td>
                <td>
                  <div class="actions">
                    <button class="btn-action btn-action--detail" @click="openRoundDetailModal(round)">รายละเอียด</button>
                    <button class="btn-action" @click="openEditRoundModal(round)">แก้ไข</button>
                    <button
                      class="btn-action"
                      :class="isRoundOpen(round) ? 'danger' : 'success'"
                      @click="toggleRoundStatus(round)"
                    >
                      {{ isRoundOpen(round) ? 'ปิดรอบ' : 'เปิดรอบ' }}
                    </button>
                    <button class="btn-action" @click="setRoundScheduled(round)">ตามเวลา</button>
                    <button class="btn-action" @click="openDuplicateRoundModal(round)">คัดลอก</button>
                    <button class="btn-action danger" @click="deleteRound(round.id)">ลบ</button>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="round-cards" aria-label="รายการรอบพรีออเดอร์">
          <article
            v-for="round in visibleRounds"
            :key="`card-${round.id}`"
            :class="['round-card', `round-card--${getStatusClass(round.status)}`]"
          >
            <header class="round-card__head">
              <div class="round-card__title">
                <strong>{{ round.name }}</strong>
                <small>รอบ #{{ round.id }}</small>
              </div>
              <div class="round-card__head-actions">
                <span :class="['status-badge', getStatusClass(round.status)]">
                  <span class="status-badge__dot" aria-hidden="true"></span>
                  {{ getStatusLabel(round.status) }}
                </span>
                <div class="round-card__menu">
                  <button
                    :id="`round-menu-button-${round.id}`"
                    class="round-menu-trigger"
                    type="button"
                    aria-label="เมนูการจัดการรอบ"
                    aria-haspopup="menu"
                    :aria-expanded="openRoundMenuId === round.id"
                    @click.stop="toggleRoundMenu(round.id)"
                    @keydown.esc.stop="closeRoundMenu"
                  >
                    <svg class="round-menu-trigger__icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <circle cx="5" cy="12" r="1.7" />
                      <circle cx="12" cy="12" r="1.7" />
                      <circle cx="19" cy="12" r="1.7" />
                    </svg>
                  </button>
                </div>
              </div>
            </header>

            <Teleport to="body">
              <div
                v-if="openRoundMenuId === round.id"
                :id="`round-menu-${round.id}`"
                class="round-menu-panel"
                role="menu"
                :aria-labelledby="`round-menu-button-${round.id}`"
                :style="{
                  top: `${roundMenuPosition.top}px`,
                  left: `${roundMenuPosition.left}px`,
                  visibility: roundMenuPosition.ready ? 'visible' : 'hidden',
                }"
                @click.stop
              >
                  <button type="button" role="menuitem" @click="runRoundMenuAction(() => openEditRoundModal(round))">
                    <svg class="round-menu-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="m4 16.5-.75 3.25L6.5 19 18 7.5 14.5 4zM13.5 5l3.5 3.5" />
                    </svg>
                    แก้ไข
                  </button>
                  <button type="button" role="menuitem" @click="runRoundMenuAction(() => setRoundScheduled(round))">
                    <svg class="round-menu-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <circle cx="12" cy="12" r="8.5" />
                      <path d="M12 7v5l3 2" />
                    </svg>
                    ตามเวลา
                  </button>
                  <button type="button" role="menuitem" class="round-menu-item--divider" @click="runRoundMenuAction(() => openDuplicateRoundModal(round))">
                    <svg class="round-menu-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <rect x="7" y="7" width="11" height="13" rx="1.5" />
                      <path d="M16 7V5a1.5 1.5 0 0 0-1.5-1.5h-8A1.5 1.5 0 0 0 5 5v10a1.5 1.5 0 0 0 1.5 1.5H7" />
                    </svg>
                    คัดลอก
                  </button>
                  <button type="button" role="menuitem" class="round-menu-item--danger" @click="runRoundMenuAction(() => deleteRound(round.id))">
                    <svg class="round-menu-item__icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                      <path d="M4.5 7h15M9 7V4.5h6V7M7 7l.75 13h8.5L17 7M10 10.5v6M14 10.5v6" />
                    </svg>
                    ลบ
                  </button>
              </div>
            </Teleport>

            <p v-if="round.description" class="round-card__desc">{{ round.description }}</p>

            <div class="round-card__dates">
              <div class="round-card__date">
                <span class="round-card__calendar-icon-wrap">
                  <svg class="round-card__calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
                    <path d="M8 2.75v4M16 2.75v4M3.5 9h17" />
                  </svg>
                </span>
                <div class="round-card__date-copy">
                  <span>วันเริ่ม</span>
                  <strong>
                    <span>{{ formatDateParts(round.startDate).date }}</span>
                    <small>{{ formatDateParts(round.startDate).time }}</small>
                  </strong>
                </div>
              </div>
              <div class="round-card__date">
                <span class="round-card__calendar-icon-wrap">
                  <svg class="round-card__calendar-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                    <rect x="3.5" y="4.5" width="17" height="16" rx="2" />
                    <path d="M8 2.75v4M16 2.75v4M3.5 9h17" />
                  </svg>
                </span>
                <div class="round-card__date-copy">
                  <span>วันสิ้นสุด</span>
                  <strong>
                    <span>{{ formatDateParts(round.endDate).date }}</span>
                    <small>{{ formatDateParts(round.endDate).time }}</small>
                  </strong>
                </div>
              </div>
            </div>

            <div class="round-card__actions">
              <button class="rc-btn rc-btn--primary" type="button" @click="openRoundDetailModal(round)">
                <svg class="round-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="M6 3.5h9l3 3V20.5H6z" />
                  <path d="M14 3.5v4h4M9 12h6M9 15.5h6" />
                </svg>
                รายละเอียด
              </button>
              <button
                class="rc-btn"
                :class="isRoundOpen(round) ? 'rc-btn--close' : 'rc-btn--open'"
                type="button"
                @click="toggleRoundStatus(round)"
              >
                <svg v-if="isRoundOpen(round)" class="round-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="m8.5 8.5 7 7M15.5 8.5l-7 7" />
                </svg>
                <svg v-else class="round-action-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <circle cx="12" cy="12" r="8.5" />
                  <path d="m10 8.5 5 3.5-5 3.5z" />
                </svg>
                {{ isRoundOpen(round) ? 'ปิดรอบ' : 'เปิดรอบ' }}
              </button>
            </div>
          </article>
        </div>
      </template>
      <p v-if="preorderRounds.length" class="rounds-count" role="status">แสดง {{ visibleRounds.length }} จาก {{ preorderRounds.length }} รอบ</p>
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
                <option value="scheduled">เปิดปิดตามเวลาที่กำหนด</option>
              </select>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-cancel" @click="closeRoundModal">ยกเลิก</button>
              <button type="submit" class="btn-submit">
                {{ editingRound ? 'บันทึก' : 'สร้าง' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Edit Round with Products Modal -->
    <div
      v-if="showEditRoundModal && currentRound"
      class="modal-overlay"
      @click.self="closeEditRoundModal"
    >
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

            <div
              v-if="!currentRound.products || currentRound.products.length === 0"
              class="empty-products"
            >
              <p>ยังไม่มีสินค้าในรอบนี้</p>
            </div>

            <div v-else class="products-grid">
              <div v-for="product in currentRound.products" :key="product.id" class="product-item">
                <div class="product-image">
                  <button
                    v-if="product.imageUrls && product.imageUrls[0]"
                    type="button"
                    class="image-thumb-btn"
                    @click="openImagePreview(product.imageUrls[0], product.name)"
                    :aria-label="`ดูรูป ${product.name}`"
                  >
                    <img :src="product.imageUrls[0]" :alt="product.name" />
                  </button>
                  <div v-else class="no-image">ไม่มีรูป</div>
                </div>
                <div class="product-info">
                  <h4>{{ product.name }}</h4>
                  <p class="sku">SKU: {{ product.sku || '-' }}</p>
                  <p class="category">{{ product.categoryName || '-' }}</p>
                  <div class="price-section">
                    <span class="price-label">ราคาพรีออเดอร์:</span>
                    <span class="price">{{
                      formatPrice(product.roundPrice ?? product.basePrice)
                    }}</span>
                  </div>
                  <div class="price-section">
                    <span class="price-label">ขั้นต่ำ / ยอดจอง:</span>
                    <span class="price">
                      {{ Number(product.minimumOrderQty || 0) > 0 ? `${product.minimumOrderQty} / ${product.quantityReserved || 0} ชิ้น` : `ไม่กำหนด / ${product.quantityReserved || 0} ชิ้น` }}
                    </span>
                  </div>
                  <div class="price-section china-shipping-summary">
                    <span class="price-label">ค่าส่งจีน:</span>
                    <span class="price">{{ Number(product.chinaShippingFeeThb || 0).toFixed(2) }} บาท</span>
                  </div>
                  <button class="btn-detail" @click="openProductDetailModal(product)">
                    แก้ไขรายละเอียด
                  </button>
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
    <div
      v-if="showAddProductsModal && currentRound"
      class="modal-overlay"
      @click.self="closeAddProductsModal"
    >
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
              <div
                v-for="product in filteredAvailableProducts"
                :key="product.id"
                class="product-selection"
              >
                <div class="product-selection-header">
                  <label class="product-checkbox">
                    <input
                      type="checkbox"
                      :checked="selectedProductIds.includes(product.id)"
                      @change="toggleProductSelection(product)"
                    />
                    <span class="checkmark"></span>
                    
                    <div class="product-mini-image">
                      <button
                        v-if="product.imageUrls && product.imageUrls[0]"
                        type="button"
                        class="image-thumb-btn"
                        @click.prevent.stop="openImagePreview(product.imageUrls[0], product.name)"
                        :aria-label="`ดูรูป ${product.name}`"
                      >
                        <img :src="product.imageUrls[0]" :alt="product.name" />
                      </button>
                      <div v-else class="no-image-mini">ไม่มีรูป</div>
                    </div>

                    <!-- ✅ เพิ่มเงื่อนไขแสดงรสชาติหลังชื่อสินค้าตามที่คุณขอ โดยไม่แก้ CSS -->
                    <span class="product-label">
                      {{ product.name }}
                      <span v-if="product.flavors && product.flavors.length" style="color: #8b5cf6; font-size: 0.85em; font-weight: 600; margin-left: 6px;">
                        ({{ product.flavors.join(', ') }})
                      </span>
                    </span>
                  </label>
                </div>
                <div v-if="selectedProductIds.includes(product.id)" class="selection-field-row">
                  <div class="price-input">
                    <label>ราคาพรีออเดอร์:</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      :value="
                        selectedProductRoundPrices[product.id] ?? getSuggestedRoundPrice(product)
                      "
                      @input="updateSelectedProductRoundPrice(product.id, $event.target.value)"
                      class="price-input-field"
                    />
                  </div>
                  <div class="price-input">
                    <label>จำนวนขั้นต่ำที่ต้องสั่ง (ชิ้น):</label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      :value="selectedProductMinimums[product.id] ?? product.minimumOrderQty ?? 0"
                      @input="updateSelectedProductMinimum(product.id, $event.target.value)"
                      class="price-input-field"
                    />
                    <small>กรอก 0 หากสินค้านี้ไม่มีขั้นต่ำ</small>
                  </div>
                  <div class="price-input">
                    <label>ค่าส่งจีนรวม (บาท):</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      :value="selectedProductChinaShippingFeesThb[product.id] ?? 0"
                      @input="updateSelectedProductChinaShippingFee(product.id, $event.target.value)"
                      class="price-input-field"
                    />
                    <small>ไม่มีค่าส่งจีนให้กรอก 0</small>
                  </div>
                </div>
                <div class="product-meta">
                  <span class="sku">SKU: {{ product.sku || '-' }}</span>
                  <span class="category">{{ product.categoryName || '-' }}</span>
                  <span class="price">ราคาพื้นฐาน ฿{{ formatPrice(product.basePrice) }}</span>
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
    <div
      v-if="showProductDetailModal && selectedProduct"
      class="modal-overlay"
      @click.self="closeProductDetailModal"
    >
      <div class="modal">
        <div class="modal-header">
          <h2>รายละเอียดสินค้า</h2>
          <button class="close-btn" @click="closeProductDetailModal">×</button>
        </div>

        <div class="modal-body">
          <div class="product-detail">
            <div class="product-image-large">
              <button
                v-if="selectedProduct.imageUrls && selectedProduct.imageUrls[0]"
                type="button"
                class="image-thumb-btn"
                @click="openImagePreview(selectedProduct.imageUrls[0], selectedProduct.name)"
                :aria-label="`ดูรูป ${selectedProduct.name}`"
              >
                <img :src="selectedProduct.imageUrls[0]" :alt="selectedProduct.name" />
              </button>
              <div v-else class="no-image">ไม่มีรูป</div>
            </div>
            <div class="product-info-detail">
              <h3>{{ selectedProduct.name }}</h3>
              <p><strong>SKU:</strong> {{ selectedProduct.sku || '-' }}</p>
              <p><strong>หมวดหมู่:</strong> {{ selectedProduct.categoryName || '-' }}</p>
              <p><strong>ราคาพื้นฐาน:</strong> {{ formatPrice(selectedProduct.basePrice) }} บาท</p>
              <p>
                <strong>ราคาพรีออเดอร์:</strong> {{ formatPrice(selectedProduct.roundPrice) }} บาท
              </p>
              <p>
                <strong>ยอดจองปัจจุบัน:</strong> {{ selectedProduct.quantityReserved || 0 }} ชิ้น
              </p>
              <div class="price-detail-edit">
                <label>จำนวนขั้นต่ำที่ต้องสั่ง (ชิ้น):</label>
                <input
                  type="number"
                  min="0"
                  step="1"
                  :value="productMinimumChanges[selectedProduct.id] ?? selectedProduct.minimumOrderQty ?? 0"
                  @input="updateProductMinimum(selectedProduct.id, $event.target.value)"
                  class="price-input-field"
                />
                <small>กรอก 0 หากสินค้านี้ไม่มีขั้นต่ำ</small>
              </div>
              <p class="compact">ราคาพรีออเดอร์จะแยกแก้จากราคาพื้นฐาน</p>
              <div class="price-detail-edit">
                <label>แก้ไขราคาพรีออเดอร์:</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  :value="productPriceChanges[selectedProduct.id] ?? selectedProduct.roundPrice"
                  @input="updateProductPrice(selectedProduct.id, $event.target.value)"
                  class="price-input-field"
                />
              </div>
              <div class="price-detail-edit">
                <label>ค่าส่งจีนรวม (บาท):</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  :value="productChinaShippingFeeChanges[selectedProduct.id] ?? selectedProduct.chinaShippingFeeThb ?? 0"
                  @input="updateProductChinaShippingFee(selectedProduct.id, $event.target.value)"
                  class="price-input-field"
                />
                <small>ไม่มีค่าส่งจีนให้กรอก 0</small>
              </div>
              <button
                class="btn-save-detail"
                @click="saveProductPrice(selectedProduct.id)"
                :disabled="!hasProductDetailChanged(selectedProduct.id)"
              >
                บันทึกราคาพรีออเดอร์
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Duplicate Round Modal -->
    <div
      v-if="showDuplicateModal && roundToDuplicate"
      class="modal-overlay"
      @click.self="closeDuplicateRoundModal"
    >
      <div class="modal">
        <div class="modal-header">
          <h2>คัดลอกรอบนำเข้าสินค้า</h2>
          <button class="close-btn" @click="closeDuplicateRoundModal">×</button>
        </div>

        <div class="modal-body">
          <form @submit.prevent="confirmDuplicateRound">
            <p class="duplicate-hint">
              จะสร้างรอบใหม่โดยคัดลอกสินค้าทั้งหมด{{
                roundToDuplicate.products?.length
                  ? ` (${roundToDuplicate.products.length} รายการ)`
                  : ''
              }}
              พร้อมราคาและค่าส่งจีนจากรอบ "{{ roundToDuplicate.name }}" มาไว้ในรอบใหม่
              คุณสามารถแก้ไขรายละเอียด วันที่ และสถานะของรอบใหม่ได้ตามต้องการ
            </p>

            <div class="form-group">
              <label for="duplicate-round-name">ชื่อรอบ *</label>
              <input
                id="duplicate-round-name"
                v-model="duplicateForm.name"
                type="text"
                required
                placeholder="เช่น MOKO มีนาคม 2026"
              />
            </div>

            <div class="form-group">
              <label for="duplicate-round-description">รายละเอียด</label>
              <textarea
                id="duplicate-round-description"
                v-model="duplicateForm.description"
                rows="3"
                placeholder="เช่น สินค้านำเข้าล็อตเดือนเมษายน"
              ></textarea>
            </div>

            <div class="form-group">
              <label for="duplicate-round-start-date">วันเปิด *</label>
              <input
                id="duplicate-round-start-date"
                v-model="duplicateForm.startDate"
                type="datetime-local"
                required
              />
            </div>

            <div class="form-group">
              <label for="duplicate-round-end-date">วันปิด *</label>
              <input
                id="duplicate-round-end-date"
                v-model="duplicateForm.endDate"
                type="datetime-local"
                required
              />
            </div>

            <div class="form-group">
              <label for="duplicate-round-status">สถานะ</label>
              <select id="duplicate-round-status" v-model="duplicateForm.status">
                <option value="active">เปิด</option>
                <option value="closed">ปิด</option>
                <option value="archived">เก็บถาวร</option>
                <option value="scheduled">เปิดปิดตามเวลาที่กำหนด</option>
              </select>
            </div>

            <div class="form-actions">
              <button type="button" class="btn-cancel" @click="closeDuplicateRoundModal">
                ยกเลิก
              </button>
              <button type="submit" class="btn-submit" :disabled="isDuplicating">
                {{ isDuplicating ? 'กำลังสร้าง...' : 'สร้าง' }}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>

    <!-- Image Preview Modal -->
    <div v-if="previewImage" class="modal-overlay" @click.self="closeImagePreview">
      <div class="image-preview-card">
        <button type="button" class="close-btn" @click="closeImagePreview" aria-label="ปิด">×</button>
        <img :src="previewImage.url" :alt="previewImage.title" class="image-preview-img" />
        <p v-if="previewImage.title" class="image-preview-caption">{{ previewImage.title }}</p>
      </div>
    </div>
  </div>
</template>

<script setup>
import AdminPageHeader from '../../components/AdminPageHeader.vue'
import { ref, computed, onMounted, onUnmounted, reactive, nextTick } from 'vue'
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
const selectedProductRoundPrices = reactive({})
const selectedProductChinaShippingFeesThb = reactive({})
const productPriceChanges = reactive({})
const productChinaShippingFeeChanges = reactive({})
const selectedProductMinimums = reactive({})
const productMinimumChanges = reactive({})
const showProductDetailModal = ref(false)
const selectedProduct = ref(null)
const previewImage = ref(null)

function openImagePreview(url, title) {
  if (!url) return
  previewImage.value = { url, title }
}

function closeImagePreview() {
  previewImage.value = null
}
const showDuplicateModal = ref(false)
const roundToDuplicate = ref(null)
const isDuplicating = ref(false)
const duplicateForm = ref({ name: '', description: '', startDate: '', endDate: '', status: 'active' })
let roundProgressTimer = null

const roundForm = ref({
  name: '',
  description: '',
  startDate: '',
  endDate: '',
  status: 'active',
})
const openRoundMenuId = ref(null)
const roundMenuPosition = ref({ top: 0, left: 0, ready: false })

// Normalize round object: รองรับทั้ง camelCase (จาก store) และ snake_case (จาก API โดยตรง)
function normalizeRound(round) {
  if (!round) return round
  return {
    ...round,
    id: round.id ?? round.round_id,
    name: round.name ?? round.round_name,
    description: round.description ?? round.round_description,
    startDate: round.startDate ?? round.start_date,
    endDate: round.endDate ?? round.end_date,
    status: round.status,
    products: (round.products || []).map(normalizeProduct),
  }
}

// Normalize product object: รองรับทั้ง camelCase และ snake_case
function normalizeProduct(product) {
  if (!product) return product
  const rawFlavors = product.flavors
  const parsedFlavors = rawFlavors
    ? typeof rawFlavors === 'string'
      ? (() => { try { return JSON.parse(rawFlavors) } catch { return [] } })()
      : rawFlavors
    : []
  const rawFlavorStock = product.flavorStock ?? product.flavor_stock
  const parsedFlavorStock = rawFlavorStock
    ? typeof rawFlavorStock === 'string'
      ? (() => { try { return JSON.parse(rawFlavorStock) } catch { return {} } })()
      : rawFlavorStock
    : {}
  const rawFlavorPrices = product.flavorPrices ?? product.flavor_prices
  const parsedFlavorPrices = rawFlavorPrices
    ? typeof rawFlavorPrices === 'string'
      ? (() => { try { return JSON.parse(rawFlavorPrices) } catch { return {} } })()
      : rawFlavorPrices
    : {}
  return {
    ...product,
    id: product.id ?? product.prod_id,
    name: product.name ?? product.prod_name,
    sku: product.sku,
    categoryName: product.categoryName ?? product.category_name,
    basePrice: product.basePrice ?? product.base_price,
    preorderPrice: product.preorderPrice ?? product.preorder_price,
    roundPrice: product.roundPrice ?? product.round_price,
    chinaShippingFeeThb:
      Number(product.chinaShippingFeeThb ?? product.china_shipping_fee_thb) || 0,
    quantityAvailable:
      product.quantityAvailable ?? product.quantity_available ?? product.stock_qty,
    minimumOrderQty: Number(product.minimumOrderQty ?? product.minimum_order_qty) || 0,
    quantityReserved: Number(product.quantityReserved ?? product.quantity_reserved) || 0,
    imageUrls: product.imageUrls ?? (product.image_url ? [product.image_url] : []),
    flavors: parsedFlavors,
    flavorStock: parsedFlavorStock,
    flavorPrices: parsedFlavorPrices,
  }
}

const preorderRounds = computed(() => preorderStore.preorderRounds.map(normalizeRound))
const roundSearch = ref('')
const roundStatusFilter = ref('all')
const visibleRounds = computed(() => {
  const query = roundSearch.value.trim().toLowerCase()
  return preorderRounds.value.filter((round) => {
    const status = String(round.status || '').toLowerCase()
    const matchesStatus = roundStatusFilter.value === 'all' ||
      (roundStatusFilter.value === 'active' ? ['active', 'open'].includes(status) : status === roundStatusFilter.value)
    return matchesStatus && `${round.name || ''} ${round.description || ''}`.toLowerCase().includes(query)
  })
})
const currentRound = computed(() => normalizeRound(preorderStore.currentRound))
// Loading a round detail happens in the background while its modal is open.
// Keep the page content mounted so polling/detail refreshes cannot remount the modal.
const isLoading = computed(() => preorderStore.isLoadingRounds)
const allProducts = computed(() => (adminProductStore.products || []).map(normalizeProduct))

const filteredAvailableProducts = computed(() => {
  const currentProductIds = currentRound.value?.products?.map((p) => p.id) || []
  const filtered = allProducts.value.filter((p) => !currentProductIds.includes(p.id))

  if (!searchQuery.value) return filtered

  const query = searchQuery.value.toLowerCase()
  return filtered.filter(
    (p) => p.name.toLowerCase().includes(query) || (p.sku && p.sku.toLowerCase().includes(query)),
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

function formatDateParts(dateString) {
  const formatted = formatDate(dateString)
  const [date, ...timeParts] = formatted.split(' ')
  return {
    date,
    time: timeParts.join(' '),
  }
}

function formatDateForInput(dateString) {
  const date = new Date(dateString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day}T${hours}:${minutes}`
}

function formatPrice(price) {
  return Number(price).toFixed(2)
}

function getStatusLabel(status) {
  const labels = {
    active: 'เปิด',
    open: 'เปิด',
    closed: 'ปิด',
    archived: 'เก็บถาวร',
    scheduled: 'ตามเวลา',
  }
  return labels[String(status || '').toLowerCase()] || status
}

function isRoundOpen(round) {
  return ['active', 'open'].includes(String(round?.status || '').toLowerCase())
}

async function toggleRoundMenu(roundId) {
  if (openRoundMenuId.value === roundId) {
    closeRoundMenu()
    return
  }

  openRoundMenuId.value = roundId
  roundMenuPosition.value = { top: 0, left: 0, ready: false }
  await nextTick()
  positionRoundMenu()
}

function closeRoundMenu() {
  openRoundMenuId.value = null
  roundMenuPosition.value = { top: 0, left: 0, ready: false }
}

function positionRoundMenu() {
  if (openRoundMenuId.value == null) return

  const trigger = document.getElementById(`round-menu-button-${openRoundMenuId.value}`)
  const panel = document.getElementById(`round-menu-${openRoundMenuId.value}`)
  if (!trigger || !panel) return

  const triggerRect = trigger.getBoundingClientRect()
  const panelWidth = panel.offsetWidth
  const panelHeight = panel.offsetHeight
  const viewportPadding = 12
  const gap = 8
  const fitsBelow = triggerRect.bottom + gap + panelHeight <= window.innerHeight - viewportPadding
  const top = fitsBelow
    ? triggerRect.bottom + gap
    : Math.max(viewportPadding, triggerRect.top - panelHeight - gap)
  const maxLeft = Math.max(viewportPadding, window.innerWidth - panelWidth - viewportPadding)
  const left = Math.min(
    Math.max(viewportPadding, triggerRect.right - panelWidth),
    maxLeft,
  )

  roundMenuPosition.value = {
    top,
    left,
    ready: true,
  }
}

function handleRoundMenuViewportChange() {
  if (openRoundMenuId.value != null) positionRoundMenu()
}

function runRoundMenuAction(action) {
  closeRoundMenu()
  return action()
}

function handleRoundMenuOutsideClick(event) {
  if (!(event.target instanceof Element) || event.target.closest('.round-card__menu')) return
  closeRoundMenu()
}

function handleRoundMenuKeydown(event) {
  if (event.key === 'Escape') closeRoundMenu()
}

function getStatusClass(status) {
  const normalized = String(status || '').toLowerCase()
  if (normalized === 'open' || normalized === 'active') return 'open'
  if (normalized === 'closed') return 'closed'
  if (normalized === 'archived') return 'archived'
  if (normalized === 'scheduled') return 'scheduled'
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
    startDate: formatDateForInput(round.startDate),
    endDate: formatDateForInput(round.endDate),
    status: ['active', 'open'].includes(normalizedStatus) ? 'active' : normalizedStatus || 'active',
  }
  showRoundModal.value = true
  preorderStore.fetchRoundDetail(round.id)
}

async function openRoundDetailModal(round) {
  try {
    await preorderStore.fetchRoundDetail(round.id)
    showEditRoundModal.value = true
    startRoundProgressPolling(round.id)
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
  stopRoundProgressPolling()
}

function startRoundProgressPolling(roundId) {
  stopRoundProgressPolling()
  roundProgressTimer = window.setInterval(() => {
    if (showEditRoundModal.value) {
      preorderStore.fetchRoundDetail(roundId).catch(() => {})
    }
  }, 15000)
}

function stopRoundProgressPolling() {
  if (roundProgressTimer) {
    window.clearInterval(roundProgressTimer)
    roundProgressTimer = null
  }
}

function openAddProductsModal() {
  searchQuery.value = ''
  selectedProductIds.value = []
  Object.keys(selectedProductRoundPrices).forEach((key) => {
    delete selectedProductRoundPrices[key]
  })
  Object.keys(selectedProductChinaShippingFeesThb).forEach((key) => {
    delete selectedProductChinaShippingFeesThb[key]
  })
  Object.keys(selectedProductMinimums).forEach((key) => {
    delete selectedProductMinimums[key]
  })
  showAddProductsModal.value = true
}

function closeAddProductsModal() {
  showAddProductsModal.value = false
  selectedProductIds.value = []
  Object.keys(selectedProductRoundPrices).forEach((key) => {
    delete selectedProductRoundPrices[key]
  })
  Object.keys(selectedProductChinaShippingFeesThb).forEach((key) => {
    delete selectedProductChinaShippingFeesThb[key]
  })
  Object.keys(selectedProductMinimums).forEach((key) => {
    delete selectedProductMinimums[key]
  })
}

function openProductDetailModal(product) {
  selectedProduct.value = product
  showProductDetailModal.value = true
}

function closeProductDetailModal() {
  showProductDetailModal.value = false
  selectedProduct.value = null
  Object.keys(productPriceChanges).forEach((key) => {
    delete productPriceChanges[key]
  })
  Object.keys(productChinaShippingFeeChanges).forEach((key) => {
    delete productChinaShippingFeeChanges[key]
  })
  Object.keys(productMinimumChanges).forEach((key) => {
    delete productMinimumChanges[key]
  })
}

async function openDuplicateRoundModal(round) {
  try {
    // ดึงรายละเอียดรอบให้ครบ (รวมสินค้าในรอบ) เพราะรายการในตารางหลักไม่มีสินค้าติดมาด้วย
    const detail = await preorderStore.fetchRoundDetail(round.id)
    const normalized = normalizeRound(detail)
    roundToDuplicate.value = normalized
    const normalizedStatus = String(normalized.status || '').toLowerCase()
    duplicateForm.value = {
      name: `${normalized.name} (คัดลอก)`,
      description: normalized.description || '',
      startDate: formatDateForInput(normalized.startDate),
      endDate: formatDateForInput(normalized.endDate),
      status: ['active', 'open'].includes(normalizedStatus) ? 'active' : normalizedStatus || 'active',
    }
    showDuplicateModal.value = true
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

function closeDuplicateRoundModal() {
  showDuplicateModal.value = false
  roundToDuplicate.value = null
  duplicateForm.value = { name: '', description: '', startDate: '', endDate: '', status: 'active' }
}

async function confirmDuplicateRound() {
  const source = roundToDuplicate.value
  const name = String(duplicateForm.value.name || '').trim()

  if (!source || !name) {
    return
  }

  isDuplicating.value = true

  try {
    // 1) สร้างรอบใหม่ ตามรายละเอียด/วันที่/สถานะที่กรอกใน modal (prefill มาจากรอบต้นฉบับ แต่แก้ไขได้)
    const newRound = await preorderStore.createRound({
      name,
      description: duplicateForm.value.description || '',
      startDate: duplicateForm.value.startDate,
      endDate: duplicateForm.value.endDate,
      status: duplicateForm.value.status || 'active',
    })

    // 2) คัดลอกสินค้าทั้งหมดในรอบเดิม (พร้อมราคาพรีออเดอร์ ค่าส่งจีน และจำนวน) ไปยังรอบใหม่
    const products = source.products || []
    if (products.length > 0) {
      await preorderStore.addProductsToRound(
        newRound.id,
        products.map((product) => product.id),
        products.map((product) => Number(product.quantityAvailable) || 0),
        products.map((product) => Number(product.minimumOrderQty) || 0),
        products.map((product) => Number(product.roundPrice) || 0),
        products.map((product) => Number(product.chinaShippingFeeThb) || 0),
      )
    }

    closeDuplicateRoundModal()
    await preorderStore.fetchRounds()
  } catch (error) {
    alert('เกิดข้อผิดพลาดในการคัดลอกรอบ: ' + error.message)
  } finally {
    isDuplicating.value = false
  }
}

function getSuggestedRoundPrice(product) {
  if (!product || typeof product !== 'object') {
    return 0
  }

  const roundPrice = Number(product.roundPrice)
  if (Number.isFinite(roundPrice) && roundPrice > 0) {
    return roundPrice
  }

  const flavorPreorderPrices = Object.values(product.flavorPrices || {})
    .map((entry) => {
      const rawPrice =
        entry && typeof entry === 'object'
          ? entry.preorderPrice ?? entry.preorder_price
          : entry
      return Number(rawPrice)
    })
    .filter((price) => Number.isFinite(price) && price > 0)

  if (flavorPreorderPrices.length > 0) {
    return Math.min(...flavorPreorderPrices)
  }

  const preorderPrice = Number(product.preorderPrice)
  if (Number.isFinite(preorderPrice) && preorderPrice > 0) {
    return preorderPrice
  }

  return Number(product.basePrice) || 0
}

function toggleProductSelection(product) {
  const productId = product.id
  const index = selectedProductIds.value.indexOf(productId)
  if (index > -1) {
    selectedProductIds.value.splice(index, 1)
    delete selectedProductRoundPrices[productId]
    delete selectedProductChinaShippingFeesThb[productId]
    delete selectedProductMinimums[productId]
  } else {
    selectedProductIds.value.push(productId)
    selectedProductRoundPrices[productId] = getSuggestedRoundPrice(product)
    selectedProductChinaShippingFeesThb[productId] = 0
    selectedProductMinimums[productId] = Number(product.minimumOrderQty) || 0
  }
}

function updateSelectedProductRoundPrice(productId, price) {
  const value = Number(price)
  if (Number.isNaN(value) || value < 0) {
    return
  }

  if (selectedProductIds.value.includes(productId)) {
    selectedProductRoundPrices[productId] = value
  }
}

function updateSelectedProductChinaShippingFee(productId, fee) {
  const value = Number(fee)
  if (Number.isNaN(value) || value < 0) return

  if (selectedProductIds.value.includes(productId)) {
    selectedProductChinaShippingFeesThb[productId] = value
  }
}

function updateSelectedProductMinimum(productId, quantity) {
  const value = Number(quantity)
  if (!Number.isInteger(value) || value < 0) return
  if (selectedProductIds.value.includes(productId)) {
    selectedProductMinimums[productId] = value
  }
}

function updateProductPrice(productId, price) {
  if (price === null) {
    if (currentRound.value?.products) {
      productPriceChanges[productId] = null
    }
    return
  }

  const value = Number(price)
  if (Number.isNaN(value) || value < 0) {
    return
  }

  if (currentRound.value?.products) {
    productPriceChanges[productId] = value
  }
}

function updateProductChinaShippingFee(productId, fee) {
  const value = Number(fee)
  if (Number.isNaN(value) || value < 0) return
  productChinaShippingFeeChanges[productId] = value
}

function updateProductMinimum(productId, quantity) {
  const value = Number(quantity)
  if (!Number.isInteger(value) || value < 0) return
  productMinimumChanges[productId] = value
}

async function saveProductPrice(productId) {
  try {
    if (!currentRound.value) return
    const raw = Object.prototype.hasOwnProperty.call(productPriceChanges, productId)
      ? productPriceChanges[productId]
      : currentRound.value.products.find((p) => String(p.id) === String(productId))?.roundPrice
    const chinaFee = Object.prototype.hasOwnProperty.call(productChinaShippingFeeChanges, productId)
      ? productChinaShippingFeeChanges[productId]
      : currentRound.value.products.find((p) => String(p.id) === String(productId))?.chinaShippingFeeThb || 0
    const minimumOrderQty = Object.prototype.hasOwnProperty.call(productMinimumChanges, productId)
      ? productMinimumChanges[productId]
      : currentRound.value.products.find((p) => String(p.id) === String(productId))?.minimumOrderQty || 0

    await preorderStore.updateProductPriceInRound(
      currentRound.value.id,
      productId,
      raw,
      chinaFee,
      minimumOrderQty,
    )
    await preorderStore.fetchRoundDetail(currentRound.value.id)
    selectedProduct.value =
      currentRound.value.products.find((product) => String(product.id) === String(productId)) ||
      selectedProduct.value
    delete productPriceChanges[productId]
    delete productChinaShippingFeeChanges[productId]
    delete productMinimumChanges[productId]
  } catch (err) {
    alert('การบันทึกราคาพรีออเดอร์ล้มเหลว: ' + err.message)
  }
}

function hasPriceChanged(productId) {
  if (!currentRound.value?.products) return false
  const product = currentRound.value.products.find((p) => String(p.id) === String(productId))
  if (!product) return false
  const left = Object.prototype.hasOwnProperty.call(productPriceChanges, productId)
    ? productPriceChanges[productId]
    : product.roundPrice
  const right = product.roundPrice
  return Number(left) !== Number(right)
}

function hasProductDetailChanged(productId) {
  return (
    hasPriceChanged(productId) ||
    Object.prototype.hasOwnProperty.call(productChinaShippingFeeChanges, productId) ||
    Object.prototype.hasOwnProperty.call(productMinimumChanges, productId)
  )
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
      // ✅ ไม่มีช่องกรอกจำนวนตอนเพิ่มสินค้าเข้ารอบพรีออเดอร์แล้ว บันทึกเป็น 0 เสมอ
      // แล้วแอดมินสามารถกลับมาแก้ไขจำนวนได้ทีหลังผ่าน "แก้ไขจำนวน" ในรายละเอียดสินค้า
      const quantities = selectedProductIds.value.map(() => 0)
      const roundPrices = selectedProductIds.value.map((id) => {
        if (selectedProductRoundPrices[id] != null) {
          return selectedProductRoundPrices[id]
        }

        const product = filteredAvailableProducts.value.find((p) => String(p.id) === String(id))
        return getSuggestedRoundPrice(product)
      })
      const chinaShippingFeesThb = selectedProductIds.value.map(
        (id) => selectedProductChinaShippingFeesThb[id] ?? 0,
      )
      const minimumOrderQtys = selectedProductIds.value.map(
        (id) => selectedProductMinimums[id] ?? 0,
      )
      await preorderStore.addProductsToRound(
        currentRound.value.id,
        selectedProductIds.value,
        quantities,
        minimumOrderQtys,
        roundPrices,
        chinaShippingFeesThb,
      )
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

async function setRoundScheduled(round) {
  try {
    await preorderStore.updateRound(round.id, {
      name: round.name,
      description: round.description || '',
      startDate: round.startDate,
      endDate: round.endDate,
      status: 'scheduled',
    })
  } catch (error) {
    alert('เกิดข้อผิดพลาด: ' + error.message)
  }
}

onMounted(async () => {
  document.addEventListener('click', handleRoundMenuOutsideClick)
  document.addEventListener('keydown', handleRoundMenuKeydown)
  window.addEventListener('resize', handleRoundMenuViewportChange)
  window.addEventListener('scroll', handleRoundMenuViewportChange, true)
  await preorderStore.fetchRounds()
  if (typeof adminProductStore.fetchProducts === 'function') {
    await adminProductStore.fetchProducts()
  }
})

onUnmounted(() => {
  document.removeEventListener('click', handleRoundMenuOutsideClick)
  document.removeEventListener('keydown', handleRoundMenuKeydown)
  window.removeEventListener('resize', handleRoundMenuViewportChange)
  window.removeEventListener('scroll', handleRoundMenuViewportChange, true)
  closeRoundMenu()
  stopRoundProgressPolling()
})
</script>

<style scoped>
.preorder-container {
  padding: 20px;
  background: transparent;
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
  background: #8154b3;
  color: white;
  border: none;
  padding: 12px 24px;
  border-radius: 10px;
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
  background: #fff;
  border: 1px solid #e9e2f0;
  border-radius: 18px;
  padding: 24px;
  box-shadow: 0 4px 18px #49316405;
}

.empty-state,
.loading {
  text-align: center;
  padding: 40px 20px;
  color: #999;
}

.table-scroll-wrap {
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.preorder-table {
  width: 100%;
  min-width: 720px;
  border-collapse: collapse;
}

.preorder-table thead {
  background-color: #f8f5fc;
}

.preorder-table th {
  padding: 16px;
  text-align: left;
  font-weight: 600;
  color: #594268;
  font-size: 0.8rem;
  border-bottom: 1px solid #e9e2f0;
}

.preorder-table td {
  padding: 22px 16px;
  border-bottom: 1px solid #f0eaf5;
  color: #51415f;
  font-size: 0.875rem;
}

.preorder-table tbody tr:hover {
  background-color: #fafafa;
}

.project-column {
  color: #685775;
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

.status-badge.scheduled {
  background-color: #fff3cd;
  color: #8a6d3b;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  min-width: 250px;
}

.btn-action {
  background-color: #fff;
  color: #756482;
  border: 1px solid #e7deef;
  padding: 8px 12px;
  margin: 0;
  border-radius: 8px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-action:hover {
  background-color: #e0e0e0;
}

.btn-action.danger {
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

.duplicate-hint {
  margin: 0 0 16px;
  padding: 12px 14px;
  background: #f5f0fb;
  border: 1px solid #e4d6f7;
  border-radius: 8px;
  color: #6b4f8f;
  font-size: 13.5px;
  line-height: 1.5;
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
  object-fit: contain;
}

.image-thumb-btn {
  width: 100%;
  height: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
  display: block;
  transition: opacity 0.15s ease;
}

.image-thumb-btn:hover,
.image-thumb-btn:focus-visible {
  opacity: 0.85;
  outline: none;
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
  line-clamp: 2;
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

/* -- ส่วนที่เพิ่มใหม่สำหรับรูป Thumbnail ใน Modal ค้นหาสินค้า -- */
.product-mini-image {
  width: 48px;
  height: 48px;
  margin-right: 12px;
  border-radius: 6px;
  overflow: hidden;
  background-color: #f5f5f5;
  flex-shrink: 0;
  border: 1px solid #eee;
}

.product-mini-image img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.no-image-mini {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  font-size: 10px;
}
/* ---------------------------------------------------- */

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

.selection-field-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin: 8px 0 0 28px;
}

.price-input {
  display: flex;
  align-items: center;
  gap: 8px;
}

.quantity-input label {
  font-size: 12px;
  color: #666;
  font-weight: 500;
  white-space: nowrap;
}

.price-input label {
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

.price-field,
.price-input-field {
  width: 110px;
  padding: 4px 8px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 12px;
  text-align: center;
}

.price-field:focus,
.price-input-field:focus {
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

.price-detail-edit {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
}

.quantity-detail-edit label {
  font-size: 13px;
  color: #5e3b77;
  min-width: 84px;
}

.price-detail-edit label {
  font-size: 13px;
  color: #5e3b77;
  min-width: 120px;
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
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.product-image-large {
  width: 100%;
  max-width: 320px;
  aspect-ratio: 4 / 3;
  margin: 0 auto;
  border-radius: 20px;
  overflow: hidden;
  background: #f7f0ff;
  display: flex;
  align-items: center;
  justify-content: center;
}

.product-image-large img {
  width: 100%;
  height: 100%;
  object-fit: contain;
}

.product-info-detail {
  background: #fbf5ff;
  border-radius: 20px;
  padding: 20px 22px;
  border: 1px solid rgba(218, 199, 242, 0.9);
}

.product-info-detail h3 {
  margin-top: 0;
  color: #3c1f59;
  font-size: 20px;
  margin-bottom: 16px;
  text-align: center;
}

.product-info-detail p {
  margin: 10px 0;
  color: #534264;
  font-size: 14.5px;
  line-height: 1.7;
}

.product-info-detail p strong {
  color: #382548;
}

/* Responsive */
.rounds-toolbar { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 20px; margin-bottom: 24px; }
.rounds-toolbar h2 { margin: 0; color: #49345f; font-size: 1.1rem; }
.rounds-toolbar h2 span { display: inline-block; margin-left: 8px; padding: 4px 10px; border-radius: 8px; font-size: 0.8rem; background: #f1eafa; color: #8154b3; }
.rounds-toolbar p { margin: 8px 0 0; font-size: 0.8rem; color: #685775; }
.rounds-filters { display: flex; flex-wrap: wrap; gap: 10px; }
.rounds-filters input, .rounds-filters select { box-sizing: border-box; padding: 11px 14px; border: 1px solid #e7deef; border-radius: 10px; background: #fdfcfe; color: #6b577b; font: inherit; font-size: 0.85rem; min-height: 44px; }
.rounds-filters input { width: 290px; max-width: 100%; }
.rounds-filters :focus-visible, .btn-action:focus-visible, .btn-add-round:focus-visible { outline: 3px solid #c3a4e3; outline-offset: 2px; }
.round-name { display: block; color: #513664; font-size: 1rem; }
.round-id { display: block; margin-top: 6px; font-size: 0.72rem; color: #685775; }
.rounds-count { margin: 18px 0 0; font-size: 0.78rem; color: #685775; }
.btn-action--detail { color: #8154b3; background: #f4eefb; border-color: #e7d9f4; font-weight: 600; }
.status-badge { white-space: nowrap; border: 1px solid transparent; font-weight: 700; padding: 6px 12px; font-size: 13px; }
.status-badge::before { content: ''; display: inline-block; width: 6px; height: 6px; margin-right: 6px; border-radius: 50%; background: currentColor; vertical-align: middle; }
.status-badge.closed { background: #fee2e2; color: #991b1b; border-color: #f5a5a5; }
.status-badge.open, .status-badge.active { background: #dcfce7; color: #166534; border-color: #86d5a0; }
.status-badge.scheduled { background: #fef3c7; color: #854d0e; border-color: #e7c45a; }
.status-badge.archived { background: #e5e7eb; color: #374151; border-color: #b8bfca; }
.preorder-table tbody tr:last-child td { border-bottom: 0; }
@media (max-width: 600px) {
  .rounds-filters { width: 100%; }
  .rounds-filters input, .rounds-filters select { width: 100%; }
  .preorder-content { padding: 16px; }
}
@media (max-width: 767px) {
  .preorder-container {
    padding: 10px;
  }

  .preorder-header .btn-add-round {
    width: 100%;
  }

  .preorder-table {
    font-size: 13px;
    min-width: 640px;
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

  .round-details {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 600px) {
  .modal,
  .modal-large {
    width: calc(100vw - 1.25rem);
    max-width: calc(100vw - 1.25rem);
    max-height: calc(100vh - 1.25rem);
    overflow-y: auto;
  }
}
/* ── Round cards (mobile) ── */
.round-cards { display: none; }

.rc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 0 12px;
  border: 1px solid #e3d8ef;
  border-radius: 12px;
  background: #fff;
  color: #6b577b;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 700;
  cursor: pointer;
  transition: background 0.15s ease, transform 0.15s ease;
}
.rc-btn:active { transform: scale(0.98); }
.rc-btn:focus-visible { outline: 3px solid #c3a4e3; outline-offset: 2px; }
.rc-btn--primary { background: #8154b3; border-color: #8154b3; color: #fff; }
.rc-btn--open { background: #ecfdf3; border-color: #a7e3bd; color: #15803d; }
.rc-btn--close { background: #fff5f5; border-color: #f5b5b5; color: #b91c1c; }
.rc-btn--ghost { background: #faf7ff; border-color: #eadcf6; color: #7a5aa6; }
.rc-btn--danger { background: #fff; border-color: #f3c4c4; color: #d32f2f; }
.rc-btn--danger:hover { background: #fff1f1; }

@media (max-width: 767px) {
  .table-scroll-wrap { display: none; }

  .round-cards {
    display: grid;
    gap: 0.85rem;
  }

  .round-card {
    position: relative;
    overflow: hidden;
    padding: 1rem 1rem 1rem 1.15rem;
    border: 1px solid #eadcf6;
    border-radius: 18px;
    background: #fff;
    box-shadow: 0 6px 18px rgba(84, 54, 113, 0.07);
  }
  .round-card::before {
    content: '';
    position: absolute;
    inset: 0 auto 0 0;
    width: 5px;
    background: #cbb8e2;
  }
  .round-card--open::before { background: #4ade80; }
  .round-card--closed::before { background: #f87171; }
  .round-card--scheduled::before { background: #fbbf24; }
  .round-card--archived::before { background: #9ca3af; }

  .round-card__head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
  }
  .round-card__title { display: grid; gap: 0.2rem; min-width: 0; }
  .round-card__title strong {
    color: #45315f;
    font-size: 1.05rem;
    line-height: 1.35;
    overflow-wrap: anywhere;
  }
  .round-card__title small { color: #9a8aaa; font-size: 0.78rem; font-weight: 600; }
  .round-card .status-badge { flex: 0 0 auto; padding: 4px 10px; font-size: 12px; }

  .round-card__desc {
    margin: 0.65rem 0 0;
    color: #685775;
    font-size: 0.85rem;
    line-height: 1.5;
    overflow-wrap: anywhere;
  }

  .round-card__dates {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.6rem;
    margin-top: 0.85rem;
  }
  .round-card__dates > div {
    display: grid;
    gap: 0.2rem;
    padding: 0.6rem 0.7rem;
    border-radius: 12px;
    background: #faf7ff;
  }
  .round-card__dates span { color: #8a789f; font-size: 0.72rem; font-weight: 700; }
  .round-card__dates strong { color: #51415f; font-size: 0.8rem; font-weight: 700; }

  .round-card__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 0.5rem;
    margin-top: 0.9rem;
    padding-top: 0.9rem;
    border-top: 1px dashed #eadcf6;
  }

  .preorder-content { padding: 14px; }
  .rounds-toolbar { gap: 14px; margin-bottom: 16px; }
  .rounds-filters { width: 100%; }
  .rounds-filters input,
  .rounds-filters select { width: 100%; }
}

/* ── Round management cards ── */
@media (max-width: 767px) {
.round-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 18px;
}

.round-card {
  position: relative;
  min-width: 0;
  overflow: visible;
  padding: 22px 22px 20px 26px;
  border: 1px solid #eadcf6;
  border-radius: 20px;
  background: #fff;
  box-shadow: 0 8px 24px rgba(84, 54, 113, 0.08);
}

.round-card::before {
  content: '';
  position: absolute;
  inset: 0 auto 0 0;
  width: 5px;
  border-radius: 20px 0 0 20px;
  background: #cbb8e2;
}

.round-card--open::before { background: #4ade80; }
.round-card--closed::before { background: #f87171; }
.round-card--scheduled::before { background: #fbbf24; }
.round-card--archived::before { background: #9ca3af; }

.round-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}

.round-card__title {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.round-card__title strong {
  color: #45315f;
  font-size: 1.08rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.round-card__title small {
  color: #9a8aaa;
  font-size: 0.78rem;
  font-weight: 600;
}

.round-card__head-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.round-card__menu {
  position: relative;
}

.round-menu-trigger {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 40px;
  border: 1px solid #e6d9f0;
  border-radius: 12px;
  background: #fff;
  color: #715989;
  font: inherit;
  font-size: 24px;
  line-height: 1;
  cursor: pointer;
}

.round-menu-trigger__icon {
  width: 20px;
  height: 20px;
}

.round-menu-trigger:hover,
.round-menu-trigger[aria-expanded='true'] {
  border-color: #c9ace4;
  background: #f7f1fc;
  color: #684092;
}

.round-menu-trigger:focus-visible,
.round-menu-panel button:focus-visible {
  outline: 3px solid #c3a4e3;
  outline-offset: 2px;
}

.round-menu-panel {
  position: absolute;
  top: calc(100% + 8px);
  right: 0;
  z-index: 20;
  display: grid;
  width: 180px;
  gap: 2px;
  padding: 6px;
  border: 1px solid #e6d9f0;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 14px 34px rgba(72, 46, 99, 0.18);
}

.round-menu-panel button {
  display: inline-flex;
  align-items: center;
  gap: 9px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: #594268;
  font: inherit;
  font-size: 0.86rem;
  text-align: left;
  cursor: pointer;
}

.round-menu-item__icon {
  flex: 0 0 17px;
  width: 17px;
  height: 17px;
}

.round-menu-panel button:hover { background: #f7f1fc; }
.round-menu-panel .round-menu-item--danger { color: #b42318; }
.round-menu-panel .round-menu-item--danger:hover { background: #fff1f1; }
.round-menu-panel .round-menu-item--divider {
  margin-top: 4px;
  padding-top: 12px;
  border-top: 1px solid #f0e8f8;
}

.round-card__desc {
  margin: 16px 0 0;
  color: #685775;
  font-size: 0.86rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.round-card__dates {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 16px;
}

.round-card__dates > div {
  display: grid;
  min-width: 0;
  gap: 5px;
  padding: 11px 12px;
  border-radius: 13px;
  background: #faf7ff;
}

.round-card__dates span {
  color: #8a789f;
  font-size: 0.72rem;
  font-weight: 700;
}

.round-card__dates strong {
  color: #51415f;
  font-size: 0.82rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.round-card__dates {
  box-sizing: border-box;
  width: 100%;
  padding: 12px 10px;
  border: 1px solid #eee3f7;
  border-radius: 14px;
  background: #faf7ff;
  gap: 0;
  overflow: hidden;
}

.round-card__date {
  display: flex !important;
  align-items: flex-start;
  min-width: 0;
  gap: 7px;
  padding: 0 !important;
  border-radius: 0 !important;
  background: transparent !important;
}

.round-card__date + .round-card__date {
  padding-left: 10px !important;
  border-left: 1px solid #dfd1ed;
}

.round-card__calendar-icon {
  width: 15px;
  height: 15px;
  color: #8a5bb1;
}

.round-card__calendar-icon-wrap {
  display: inline-grid;
  flex: 0 0 27px;
  width: 27px;
  height: 27px;
  place-items: center;
  margin-top: 1px;
  border-radius: 8px;
  background: #f1e9fb;
  color: #8a5bb1;
}

.round-card__date-copy {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.round-card__date-copy > span {
  color: #8a789f;
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 1.2;
}

.round-card__date-copy strong {
  display: grid;
  min-width: 0;
  gap: 1px;
  color: #51415f;
  font-size: 0.72rem;
  line-height: 1.3;
  white-space: nowrap;
}

.round-card__date-copy strong > span,
.round-card__date-copy strong small {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
}

.round-card__date-copy strong > span { color: #51415f; }
.round-card__date-copy strong small {
  color: #765d88;
  font-size: 0.68rem;
  font-weight: 700;
}

.round-card__actions {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 18px;
  padding-top: 16px;
  border-top: 1px dashed #eadcf6;
}

.round-card .rc-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 44px;
  border-radius: 12px;
  font-size: 0.86rem;
  font-weight: 700;
}

.round-action-icon {
  flex: 0 0 17px;
  width: 17px;
  height: 17px;
}

.round-card .status-badge::before {
  display: none;
}

.status-badge__dot {
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-right: 6px;
  border-radius: 50%;
  background: currentColor;
  vertical-align: middle;
}

@media (max-width: 640px) {
  .round-cards { grid-template-columns: 1fr; }

  .round-card {
    padding: 18px 16px 16px 21px;
  }

  .round-card__head-actions {
    flex-wrap: wrap;
    justify-content: flex-end;
    max-width: 100%;
  }

  .round-card__menu {
    display: flex;
    flex-wrap: wrap;
    justify-content: flex-end;
    width: min(220px, calc(100vw - 2.5rem));
  }

  .round-menu-panel {
    position: static;
    flex-basis: 100%;
    width: auto;
    margin-top: 8px;
    box-shadow: 0 8px 20px rgba(72, 46, 99, 0.1);
  }

  .round-card__dates { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); }
}
}

@media (max-width: 767px) {
  .round-card__head {
    align-items: flex-start;
  }

  .round-card__title {
    flex: 1 1 auto;
    max-width: 100%;
  }

  .round-card__title strong {
    overflow-wrap: break-word;
    word-break: normal;
  }

  .round-card__head-actions {
    display: flex;
    flex: 0 0 auto;
    flex-wrap: nowrap;
    align-items: flex-start;
    justify-content: flex-end;
    gap: 8px;
  }

  .round-card__menu {
    position: static;
    display: block;
    width: auto;
  }

  .round-menu-trigger {
    flex: 0 0 40px;
  }

  .round-menu-panel {
    position: fixed;
    top: auto;
    right: auto;
    bottom: auto;
    left: auto;
    z-index: 1200;
    box-sizing: border-box;
    grid-template-columns: 1fr;
    width: min(194px, calc(100vw - 24px));
    max-height: min(50vh, 340px);
    max-height: min(50dvh, 340px);
    overflow-y: auto;
    padding: 6px;
    border-radius: 14px;
    box-shadow: 0 12px 30px rgba(72, 46, 99, 0.2);
    overscroll-behavior: contain;
  }

  .round-menu-panel button {
    min-height: 44px;
    padding: 10px 11px;
    font-size: 0.82rem;
  }
}

@media (min-width: 768px) {
  .round-menu-panel {
    display: none;
  }
}

@media (max-width: 767px) {
  .round-card {
    padding-left: 16px;
  }

  .round-card::before,
  .round-card--open::before,
  .round-card--closed::before,
  .round-card--scheduled::before,
  .round-card--archived::before {
    display: none;
  }
}

/* ── Image preview modal ── */
.image-preview-card {
  width: min(480px, 92vw);
  max-height: 90vh;
  overflow: auto;
  background: #fff;
  border-radius: 20px;
  padding: 1.1rem;
  position: relative;
  text-align: center;
}

.image-preview-card .close-btn {
  position: absolute;
  top: 0.6rem;
  right: 0.6rem;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  border: 1px solid #eadcf6;
  background: #fff;
  color: #6d3fa3;
  font-size: 1.1rem;
  cursor: pointer;
  display: grid;
  place-items: center;
}

.image-preview-card .close-btn:hover {
  background: #f5efff;
}

.image-preview-img {
  width: 100%;
  max-height: 70vh;
  object-fit: contain;
  border-radius: 14px;
  background: #f5efff;
}

.image-preview-caption {
  margin: 0.75rem 0 0;
  color: #45315f;
  font-weight: 600;
  font-size: 0.9rem;
}
</style>
