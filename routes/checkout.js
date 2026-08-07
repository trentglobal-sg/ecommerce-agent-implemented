const express = require("express");
const router = express.Router();

const orderServices = require('../services/orderServices');
const cartServices = require("../services/cartServices");
const stripeServices = require('../services/stripeServices');

const AuthenticateWithJWT = require("../middlewares/AuthenticateWithJWT");

router.post("/", AuthenticateWithJWT,   async function(req,res){
    const cartItems = await cartServices.getCartContents(req.userId);
    const orderId = await orderServices.createOrder(req.userId, cartItems);
    
    const stripeSession = await stripeServices
            .createCheckoutSession(req.userId, cartItems, orderId);

    await orderServices.updateOrderSessionId(orderId, stripeSession.id);
    
    res.json({
        session: stripeSession
    });
})

module.exports = router;