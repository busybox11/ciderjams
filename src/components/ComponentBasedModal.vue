<script setup lang="ts">

// Required for component-based modals
const emits = defineEmits(['dialogClose', 'dialogResolve'])

const showBackButton = ref(true);
const backPressed = ref(false);

const modalTitle = ref('Component Based Modal Example');

const onBackPressed = () => {
    backPressed.value = true;
};

</script>

<template>
    <div class="modal-content plugin-base">
        <cider-modal-title-bar
            :title="modalTitle"
            :back-btn="showBackButton"
            @back-pressed="onBackPressed"
            @close-pressed="emits('dialogClose')"
        />
        <div class="q-pa-sm">
            component-based modal example
            <br>
            <label>
                <input
                    type="checkbox"
                    v-model="showBackButton"
                >
                Show back button
            </label>
            <br>
            <label>
                Title
                <input
                    type="text"
                    v-model="modalTitle"
                >
            </label>
            <br>
            <span v-if="backPressed">
                Back button was pressed!
            </span>
        </div>
        <div class="q-pa-sm">
            Footer
        </div>
    </div>
</template>

<style scoped>
.modal-content {
    height: 300px;
    width: 400px;
    display: grid;
    grid-template-rows: auto 1fr auto;
}
</style>