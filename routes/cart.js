const express = require('express');
const router = express.Router();

const AuthenticateWithJWT = require("../middlewares/AuthenticateWithJWT");

const cartServices = require('../services/cartServices')

// GET content of cart
/* Expected return shape
[
    {
        id: Math.floor(Math.random() * 10000 + 1),
        product_id: product.id,
        name: product.name,
        price: product.price,
        imageUrl: product.imageUrl,
        description: product.description,
        quantity: 1
    }
]      
*/
router.get('/', AuthenticateWithJWT, async function (req, res) {
    const cartContents = await cartServices.getCartContents(req.userId);
    res.json(cartContents);
})

// PUT update the cart
router.put('/', AuthenticateWithJWT, async function (req, res) {
    await cartServices.updateCartContents(req.userId, req.body.cart_items);
    res.json({
        "message": "Updating cart content"
    })
})

module.exports = router;