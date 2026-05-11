import { ref } from 'vue'

const preorderRounds = ref([])
const currentRound = ref(null)
const isLoadingRounds = ref(false)
const isLoadingCurrentRound = ref(false)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function requestJson(path, options = {}) {
  const userDataStr =
    localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
  let userId = null
  let userRole = 'admin'

  if (userDataStr) {
    try {
      const userData = JSON.parse(userDataStr)
      userId = userData.user_id || userData.id
      userRole = userData.role || 'admin'
    } catch {
      // Fall back to default values when the stored payload cannot be parsed.
    }
  }

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-user-id': String(userId || ''),
      'x-user-role': userRole,
      ...options.headers,
    },
  })

  if (!response.ok) {
    let errorMessage = `Request failed with status ${response.status}`

    try {
      const errorBody = await response.json()
      if (errorBody?.message) {
        errorMessage = errorBody.message
      } else if (errorBody?.error) {
        errorMessage = errorBody.error
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

function findRoundIndex(id) {
  return preorderRounds.value.findIndex((round) => String(round.id) === String(id))
}

function syncCurrentRound(roundId, updater) {
  if (currentRound.value && String(currentRound.value.id) === String(roundId)) {
    updater(currentRound.value)
  }
}

export function usePreorderStore() {
  async function fetchRounds() {
    isLoadingRounds.value = true

    try {
      preorderRounds.value = await requestJson('/preorder-rounds')
      return preorderRounds.value
    } finally {
      isLoadingRounds.value = false
    }
  }

  async function fetchRoundDetail(roundId) {
    isLoadingCurrentRound.value = true
    currentRound.value = null

    try {
      currentRound.value = await requestJson(`/preorder-rounds/${roundId}`)
      return currentRound.value
    } finally {
      isLoadingCurrentRound.value = false
    }
  }

  async function createRound(payload) {
    const newRound = await requestJson('/preorder-rounds', {
      method: 'POST',
      body: JSON.stringify({
        name: String(payload.name || '').trim(),
        description: String(payload.description || '').trim(),
        startDate: payload.startDate,
        endDate: payload.endDate,
        status: payload.status || 'active',
      }),
    })

    preorderRounds.value.unshift(newRound)
    return newRound
  }

  async function updateRound(roundId, payload) {
    const updatedRound = await requestJson(`/preorder-rounds/${roundId}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: String(payload.name || '').trim(),
        description: String(payload.description || '').trim(),
        startDate: payload.startDate,
        endDate: payload.endDate,
        status: payload.status || 'active',
      }),
    })

    const index = findRoundIndex(roundId)
    if (index !== -1) {
      preorderRounds.value[index] = updatedRound
    }

    syncCurrentRound(roundId, (round) => {
      Object.assign(round, updatedRound)
    })

    return updatedRound
  }

  async function deleteRound(roundId) {
    await requestJson(`/preorder-rounds/${roundId}`, {
      method: 'DELETE',
    })

    preorderRounds.value = preorderRounds.value.filter(
      (round) => String(round.id) !== String(roundId),
    )

    if (currentRound.value && String(currentRound.value.id) === String(roundId)) {
      currentRound.value = null
    }
  }

  async function addProductsToRound(roundId, productIds, quantities = [], roundPrices = []) {
    await requestJson(`/preorder-rounds/${roundId}/products`, {
      method: 'POST',
      body: JSON.stringify({
        productIds: productIds.map((id) => Number(id)),
        quantities: quantities.map((quantity) => Number(quantity) || 0),
        roundPrices: roundPrices.map((price) =>
          price === '' || price == null ? null : Number(price),
        ),
      }),
    })

    if (currentRound.value && String(currentRound.value.id) === String(roundId)) {
      await fetchRoundDetail(roundId)
    }
  }

  async function removeProductFromRound(roundId, productId) {
    await requestJson(`/preorder-rounds/${roundId}/products/${productId}`, {
      method: 'DELETE',
    })

    syncCurrentRound(roundId, (round) => {
      round.products = round.products.filter((product) => String(product.id) !== String(productId))
    })
  }

  async function updateProductQuantityInRound(roundId, productId, quantity, roundPrice = null) {
    const quantityPayload = quantity === null || quantity === '' ? null : Number(quantity)
    await requestJson(`/preorder-rounds/${roundId}/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantity: quantityPayload,
        roundPrice: roundPrice === '' || roundPrice == null ? null : Number(roundPrice),
      }),
    })

    syncCurrentRound(roundId, (round) => {
      const product = round.products.find((item) => String(item.id) === String(productId))
      if (product) {
        product.quantityAvailable = quantityPayload
        if (roundPrice !== undefined && roundPrice !== null && roundPrice !== '') {
          product.roundPrice = Number(roundPrice)
        }
      }
    })
  }

  async function updateProductPriceInRound(roundId, productId, price) {
    await requestJson(`/preorder-rounds/${roundId}/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({
        price: price === '' || price == null ? null : Number(price),
      }),
    })

    syncCurrentRound(roundId, (round) => {
      const product = round.products.find((item) => String(item.id) === String(productId))
      if (product) {
        product.roundPrice =
          price === '' || price == null ? Number(product.basePrice) : Number(price)
      }
    })
  }

  async function reloadRounds() {
    return fetchRounds()
  }

  return {
    get preorderRounds() {
      return preorderRounds.value
    },
    get currentRound() {
      return currentRound.value
    },
    get isLoadingRounds() {
      return isLoadingRounds.value
    },
    get isLoadingCurrentRound() {
      return isLoadingCurrentRound.value
    },
    get isLoading() {
      return isLoadingRounds.value || isLoadingCurrentRound.value
    },
    fetchRounds,
    fetchRoundDetail,
    createRound,
    updateRound,
    deleteRound,
    addProductsToRound,
    removeProductFromRound,
    updateProductQuantityInRound,
    updateProductPriceInRound,
    reloadRounds,
  }
}
