import { ref } from 'vue'

const categories = ref([])
const products = ref([])

const isLoadingCategories = ref(false)
const isLoadingProducts = ref(false)

const statusUpdatingProductIds = ref(new Set())

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`

    try {
      const errorBody = await response.json()
      if (errorBody?.message) {
        errorMessage = errorBody.message
      }
    } catch {
      // Keep fallback message when response body is not JSON.
    }

    throw new Error(errorMessage)
  }

  if (response.status === 204) {
    return null
  }

  return response.json()
}

function findProductIndex(id) {
  return products.value.findIndex((product) => String(product.id) === String(id))
}

export function useAdminProductStore() {
  async function fetchCategories() {
    isLoadingCategories.value = true

    try {
      categories.value = await requestJson('/categories')
      return categories.value
    } finally {
      isLoadingCategories.value = false
    }
  }

  async function createCategory(payload) {
    const detailText = String(payload.detail || '').trim()

    const newCategory = await requestJson('/categories', {
      method: 'POST',
      body: JSON.stringify({
        name: String(payload.name || '').trim(),
        detail: detailText || null,
      }),
    })

    categories.value = [...categories.value, newCategory].sort((a, b) =>
      String(a.name || '').localeCompare(String(b.name || '')),
    )

    return newCategory
  }

  async function deleteCategory(id) {
    await requestJson(`/categories/${id}`, {
      method: 'DELETE',
    })

    categories.value = categories.value.filter((category) => String(category.id) !== String(id))
  }

  async function fetchProducts() {
    isLoadingProducts.value = true

    try {
      products.value = await requestJson('/products')
      return products.value
    } finally {
      isLoadingProducts.value = false
    }
  }

  async function uploadProductImage(file) {
    if (!file) {
      throw new Error('No file selected.')
    }

    const formData = new FormData()
    formData.append('image', file)

    const response = await fetch(`${API_BASE_URL}/uploads/images`, {
      method: 'POST',
      body: formData,
    })

    if (!response.ok) {
      throw new Error('Failed to upload image.')
    }

    return response.json()
  }

  function getPayload(payload) {
    const flavorStock =
      payload.flavorStock && typeof payload.flavorStock === 'object'
        ? Object.fromEntries(
            Object.entries(payload.flavorStock).map(([flavor, qty]) => [
              String(flavor || '').trim(),
              Number(qty) || 0,
            ]),
          )
        : {}

    return {
      name: payload.name,
      description: payload.description,
      flavors: payload.flavors || [],
      sku: payload.sku,
      categoryId: Number(payload.categoryId),
      stock: Number(payload.stock) || 0,
      flavorStock,
      basePrice: Number(payload.basePrice) || 0,
      imageUrls: payload.imageUrls || [],
      preorderEnabled: Boolean(payload.preorderEnabled),
      readyToShipEnabled: Boolean(payload.readyToShipEnabled),
    }
  }

  async function createProduct(payload) {
    const newProduct = await requestJson('/products', {
      method: 'POST',
      body: JSON.stringify(getPayload(payload)),
    })

    products.value.unshift(newProduct)
    return newProduct
  }

  async function updateProduct(id, payload) {
    const updatedProduct = await requestJson(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(getPayload(payload)),
    })

    const index = findProductIndex(id)
    if (index !== -1) {
      products.value[index] = updatedProduct
    }

    return updatedProduct
  }

  async function removeProduct(id) {
    await requestJson(`/products/${id}`, {
      method: 'DELETE',
    })

    products.value = products.value.filter((product) => String(product.id) !== String(id))
  }

  async function toggleProductFlag(productId, key, value) {
    statusUpdatingProductIds.value.add(productId)

    try {
      const updatedProduct = await requestJson(`/products/${productId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ key, value }),
      })

      const index = findProductIndex(productId)
      if (index === -1) {
        throw new Error('Product not found.')
      }

      products.value[index] = updatedProduct

      return updatedProduct
    } finally {
      statusUpdatingProductIds.value.delete(productId)
    }
  }

  async function reloadProducts() {
    return fetchProducts()
  }

  return {
    get categories() {
      return categories.value
    },
    get products() {
      return products.value
    },
    get isLoadingCategories() {
      return isLoadingCategories.value
    },
    get isLoadingProducts() {
      return isLoadingProducts.value
    },
    get isLoading() {
      return isLoadingCategories.value || isLoadingProducts.value
    },
    get statusUpdatingProductIds() {
      return statusUpdatingProductIds.value
    },
    fetchCategories,
    createCategory,
    deleteCategory,
    fetchProducts,
    reloadProducts,
    uploadProductImage,
    createProduct,
    updateProduct,
    removeProduct,
    toggleProductFlag,
  }
}
