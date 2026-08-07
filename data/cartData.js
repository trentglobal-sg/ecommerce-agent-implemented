const pool = require('../database');

async function getCartContents(userId) {
    const [rows] = await pool.execute(
        `
        SELECT 
            cart_items.id,
            cart_items.product_id,
            products.imageUrl,
            products.name,
            CAST(products.price AS DOUBLE) AS price,
            cart_items.quantity,
            products.description
        FROM cart_items JOIN products
            ON cart_items.product_id = products.id
        WHERE cart_items.user_id = ?
        `, [userId]
    )

    return rows;
}

// cartItems will be array of shopping cart items from the frontend
async function updateCart(userId, cartItems) {

    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // 1. delete all the existing cart items
        await connection.execute("DELETE FROM cart_items WHERE user_id = ?", [userId]);
        

        // 2 for each cart item, we will insert into the row
        for (let item of cartItems) {
            await connection.execute(`INSERT INTO cart_items (user_id, product_id, quantity) VALUES (?, ?, ?)`, 
                [userId, item.product_id, item.quantity])
        }

        await connection.commit();
    } catch (e) {
        console.error(e);
        await connection.rollback();
    } finally {
        connection.release();
    }
}

module.exports = {
    getCartContents,
    updateCart
}