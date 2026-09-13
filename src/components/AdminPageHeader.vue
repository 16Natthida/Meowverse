<script setup>
defineProps({
  title: { type: String, required: true },
  description: { type: String, default: '' },
})
</script>

<template>
  <header class="admin-page-heading">
    <div class="admin-page-heading__copy">
      <h1>{{ title }}</h1>
      <p v-if="description">{{ description }}</p>
      <div v-if="$slots.details" class="admin-page-heading__details"><slot name="details" /></div>
    </div>
    <div v-if="$slots.default" class="admin-page-heading__actions"><slot /></div>
  </header>
</template>

<style scoped>
.admin-page-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 20px;
  box-sizing: border-box;
  width: 100%;
  padding: 24px 28px;
  margin: 0 0 24px;
  border: 1px solid #e9e2f0;
  border-radius: 16px;
  background: #fff;
  box-shadow: 0 4px 16px #49316405;
  text-align: left;
}
.admin-page-heading__copy { flex: 1; min-width: 0; }
.admin-page-heading h1 { margin: 0; color: #432f61; font-size: 1.65rem; font-weight: 700; line-height: 1.45; overflow-wrap: anywhere; }
.admin-page-heading p { margin: 8px 0 0; color: #80708f; font-size: 0.9rem; font-weight: 400; line-height: 1.7; }
.admin-page-heading__actions { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; }
.admin-page-heading__details { margin-top: 12px; color: #80708f; font-size: 0.85rem; }
@media (max-width: 768px) {
  .admin-page-heading { padding: 20px; gap: 16px; }
  .admin-page-heading h1 { font-size: 1.35rem; }
  .admin-page-heading__copy { flex-basis: 100%; }
}
</style>
