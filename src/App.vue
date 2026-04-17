<template>
  <div id="app">
    <header class="app-header">
      <div class="brand">
        <div class="brand-mark">M</div>
        <div>
          <h1>Meowverse Admin</h1>
          <p>Pet shop management</p>
        </div>
      </div>

      <nav class="top-nav">
        <router-link to="/">Home</router-link>
        <router-link to="/login">Login</router-link>
      </nav>
    </header>

    <main class="app-body">
      <router-view />
    </main>
  </div>
</template>

<script setup>
</script>

<style scoped>
#app {
  display: flex;
  flex-direction: column;
  align-items: center;
  min-height: 100vh;
  background: #f7f5ff;
  color: #2f2f3a;
}

.app-body {
  width: 100%;
  max-width: 1280px;
  display: flex;
  justify-content: center;
  padding: 0 28px 28px;
}

.app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 24px 28px;
  background: #ffffff;
  box-shadow: 0 12px 34px rgba(124, 95, 255, 0.08);
  border-radius: 0 0 30px 30px;
  margin-bottom: 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 16px;
}

.brand-mark {
  width: 54px;
  height: 54px;
  border-radius: 18px;
  background: linear-gradient(135deg, #936dff, #6b81ff);
  color: #fff;
  display: grid;
  place-items: center;
  font-weight: 700;
  font-size: 1.35rem;
}

.brand h1 {
  margin: 0;
  font-size: 1.2rem;
}

.brand p {
  margin: 4px 0 0;
  color: #6f6b8d;
  font-size: 0.95rem;
}

.top-nav {
  display: flex;
  gap: 18px;
  align-items: center;
}

.top-nav a {
  padding: 10px 16px;
  border-radius: 16px;
  color: #5e3ff2;
  background: #f4f1ff;
  text-decoration: none;
  font-weight: 700;
}

.top-nav a.router-link-active {
  background: #5e3ff2;
  color: #ffffff;
}

.app-body {
  padding: 0 28px 28px;
}
</style>