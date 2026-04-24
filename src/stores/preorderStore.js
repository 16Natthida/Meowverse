import { ref } from 'vue'

const preorderRounds = ref([])
const currentRound = ref(null)
const isLoadingRounds = ref(false)
const isLoadingCurrentRound = ref(false)

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api'

async function requestJson(path, options = {}) {
  // Get auth info from localStorage
  const userDataStr = localStorage.getItem('meowverse-user') || sessionStorage.getItem('meowverse-user')
  let userId = null
  let userRole = 'admin'

  if (userDataStr) {
    try {
      const userData = JSON.parse(userDataStr)
      userId = userData.user_id || userData.id
      userRole = userData.role || 'admin'
    } catch {
      // Default values used
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

    if (currentRound.value && currentRound.value.id === roundId) {
      currentRound.value = { ...currentRound.value, ...updatedRound }
    }

    return updatedRound
  }

  async function deleteRound(roundId) {
    await requestJson(`/preorder-rounds/${roundId}`, {
      method: 'DELETE',
    })

    preorderRounds.value = preorderRounds.value.filter((round) => String(round.id) !== String(roundId))

    if (currentRound.value && currentRound.value.id === roundId) {
      currentRound.value = null
    }
  }

  async function addProductsToRound(roundId, productIds, quantities = []) {
    await requestJson(`/preorder-rounds/${roundId}/products`, {
      method: 'POST',
      body: JSON.stringify({
        productIds: productIds.map(id => Number(id)),
        quantities: quantities.map(q => Number(q) || 0),
      }),
    })

    // Refresh the current round if it matches
    if (currentRound.value && currentRound.value.id === roundId) {
      await fetchRoundDetail(roundId)
    }
  }

  async function removeProductFromRound(roundId, productId) {
    await requestJson(`/preorder-rounds/${roundId}/products/${productId}`, {
      method: 'DELETE',
    })

    if (currentRound.value && currentRound.value.id === roundId) {
      currentRound.value.products = currentRound.value.products.filter(
        (p) => String(p.id) !== String(productId)
      )
    }
  }

  async function updateProductQuantityInRound(roundId, productId, quantity) {
    await requestJson(`/preorder-rounds/${roundId}/products/${productId}`, {
      method: 'PUT',
      body: JSON.stringify({
        quantity: Number(quantity),
      }),
    })

    // Update the current round if it matches
    if (currentRound.value && currentRound.value.id === roundId) {
      const product = currentRound.value.products.find(p => String(p.id) === String(productId))
      if (product) {
        product.quantityAvailable = Number(quantity)
      }
    }
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
    reloadRounds,
  }
}
