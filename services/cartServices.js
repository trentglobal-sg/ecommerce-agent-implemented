const cartData = require("../data/cartData");

async function getCartContents(userId) {
    return await cartData.getCartContents(userId);
}

async function updateCartContents(userId, cartItems) {
    await cartData.updateCart(userId, cartItems);
}

module.exports = {
    getCartContents,
    updateCartContents
}