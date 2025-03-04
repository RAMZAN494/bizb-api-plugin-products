import { decodeProductOpaqueId, decodeShopOpaqueId, decodeTagOpaqueId } from "../xforms/id.js";

export default async function productsOptimize(context, {
    first, // The number of items to return
    offset = 0, // The offset to start returning items from
    shopIds: opaqueShopIds,
    productIds: opaqueProductIds,
    tagIds: opaqueTagIds,
    query,
    isArchived,
    isVisible,
    storeName,
    startDate,
    endDate,
    isSoldOut // New filter parameter
}) {
    const { collections } = context;
    const { Products, Catalog } = collections;

    // Decoding IDs
    const tagIds = opaqueTagIds ? opaqueTagIds.map(decodeTagOpaqueId) : [];
    const shopIds = opaqueShopIds ? opaqueShopIds.map(decodeShopOpaqueId) : [];
    const productIds = opaqueProductIds ? opaqueProductIds.map(decodeProductOpaqueId) : [];

    // Ensure shopIds are provided and are an array
    if (!shopIds.length) {
        throw new Error("shopIds must be provided and must be a non-empty array");
    }

    let selector = {
        ancestors: [],
        isDeleted: { $ne: true },
        shopId: { $in: shopIds }
    };

    if (productIds.length) {
        selector._id = { $in: productIds };
    }

    if (isVisible !== undefined) {
        selector.isVisible = isVisible;
    }

    if (isArchived !== undefined) {
        selector.isDeleted = isArchived;
    }

    if (storeName) {
        selector.sellerId = storeName;
    }

    if (startDate && endDate) {
        selector.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
    }

    if (tagIds.length) {
        selector.hashtags = { $in: tagIds };
    }

    if (query) {
        const cond = { $regex: query, $options: "i" };
        selector.$or = [
            { title: cond },
            { pageTitle: cond },
            { description: cond },
            { referenceId: cond }
        ];
    }

    console.log("SELECTOR: " + JSON.stringify(selector, null, 2));

    const options = {
        limit: first,
        skip: offset, // MongoDB uses 'skip' for offset
        sort: { createdAt: -1 }
    };

    const initialProducts = await Products.find(selector, options).toArray();
    const totalCount = await Products.countDocuments(selector);

    if (isSoldOut !== undefined) {
        const productIds = initialProducts.map(product => product._id);
        const catalogEntries = await Catalog.find({
            "product._id": { $in: productIds },
            "product.isSoldOut": isSoldOut
        }, { projection: { "product._id": 1 } }).toArray();

        const soldOutProductIds = new Set(catalogEntries.map(entry => entry.product._id.toString()));
        const filteredProducts = initialProducts.filter(product => soldOutProductIds.has(product._id.toString()));

        return {
            totalCount: filteredProducts.length, // Total count of filtered results
            pageInfo: {
                endCursor: filteredProducts.length ? filteredProducts[filteredProducts.length - 1]._id : null,
                hasNextPage: filteredProducts.length === first
            },
            edges: filteredProducts.map(product => ({ node: product })),
            nodes: filteredProducts
        };
    } else {
        return {
            totalCount,
            pageInfo: {
                endCursor: initialProducts.length ? initialProducts[initialProducts.length - 1]._id : null,
                hasNextPage: initialProducts.length === first
            },
            edges: initialProducts.map(product => ({ node: product })),
            nodes: initialProducts
        };
    }
}


// export default async function productsOptimize(context, {
//     first = 10,
//     shopIds: opaqueShopIds,
//     productIds: opaqueProductIds,
//     tagIds: opaqueTagIds,
//     query,
//     isArchived,
//     isVisible,
//     storeName,
//     startDate,
//     endDate,
//     isSoldOut // New filter parameter
// }) {
//     const { collections } = context;
//     const { Products, Catalog } = collections;

//     const tagIds = opaqueTagIds && opaqueTagIds.map(decodeTagOpaqueId);
//     const shopIds = opaqueShopIds && opaqueShopIds.map(decodeShopOpaqueId);
//     const productIds = opaqueProductIds && opaqueProductIds.map(decodeProductOpaqueId);

//     // Ensure shopIds are provided and are an array
//     if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
//         throw new Error("shopIds must be provided and must be a non-empty array");
//     }

//     let selector = {
//         ancestors: [],
//         isDeleted: { $ne: true },
//         shopId: { $in: shopIds }
//     };

//     // Apply the filters for product IDs, visibility, etc.
//     if (productIds) {
//         selector._id = { $in: productIds };
//     }

//     if (isVisible !== undefined) {
//         selector.isVisible = isVisible;
//     }

//     if (isArchived !== undefined) {
//         selector.isDeleted = isArchived;
//     }

//     if (storeName) {
//         selector.sellerId = storeName;
//     }

//     if (startDate && endDate) {
//         selector.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
//     }

//     if (tagIds && tagIds.length > 0) {
//         selector.hashtags = { $in: tagIds };
//     }

//     if (query) {
//         const cond = { $regex: query, $options: "i" };
//         selector.$or = [
//             { title: cond },
//             { pageTitle: cond },
//             { description: cond },
//             { referenceId: cond }
//         ];
//     }

//     console.log("SELECTOR: " + JSON.stringify(selector, null, 2));

//     const options = {
//         limit: first,
//         sort: { createdAt: -1 }
//     };

//     const initialProducts = await Products.find(selector, options).toArray();
//     const totalCount = await Products.countDocuments(selector);

//     if (isSoldOut !== undefined) {
//         // Get product IDs from the initial product fetch
//         const productIds = initialProducts.map(product => product._id);

//         console.log("PRODUCT IDS", productIds);

//         // Fetch sold out status from the Catalogs collection
//         const catalogEntries = await Catalog.find({
//             "product._id": { $in: productIds },
//             "product.isSoldOut": isSoldOut
//         }).toArray(); // Convert the cursor to an array

//         console.log("CATALOG ENTRIES", catalogEntries);

//         // Filter the initial products based on the sold out status
//         const soldOutProductIds = new Set(catalogEntries.map(entry => entry.product._id));

//         console.log("SOLD OUT PRODUCT IDS", soldOutProductIds);
//         const filteredProducts = initialProducts.filter(product => soldOutProductIds.has(product._id.toString()));

//         console.log("FILTERED PRODUCTS", filteredProducts);

//         return {
//             totalCount,
//             pageInfo: {
//                 endCursor: filteredProducts.length > 0 ? filteredProducts[filteredProducts.length - 1]._id : null,
//                 hasNextPage: filteredProducts.length === first
//             },
//             edges: filteredProducts.map(product => ({ node: product })),
//             nodes: filteredProducts
//         };
//     } else {
//         // Pagination logic for all other products
//         const edges = initialProducts.map(product => ({ node: product }));
//         const pageInfo = {
//             endCursor: edges.length > 0 ? edges[edges.length - 1].node._id : null,
//             hasNextPage: edges.length === first
//         };

//         return {
//             totalCount,
//             pageInfo,
//             edges,
//             nodes: initialProducts
//         };
//     }
// }



// import { decodeProductOpaqueId, decodeShopOpaqueId, decodeTagOpaqueId } from "../xforms/id.js";

// export default async function productsOptimize(context, {
//     first = 10,
//     shopIds: opaqueShopIds,
//     productIds: opaqueProductIds,
//     tagIds: opaqueTagIds,
//     query,
//     isArchived,
//     isVisible,
//     storeName,
//     startDate,
//     endDate,
//     isSoldOut // New filter parameter
// }) {
//     const { collections } = context;
//     const { Products, Catalog } = collections;

//     const tagIds = opaqueTagIds && opaqueTagIds.map(decodeTagOpaqueId)
//     const shopIds = opaqueShopIds && opaqueShopIds.map(decodeShopOpaqueId)
//     const productIds = opaqueProductIds && opaqueProductIds.map(decodeProductOpaqueId)

//     // Ensure shopIds are provided and are an array
//     if (!shopIds || !Array.isArray(shopIds) || shopIds.length === 0) {
//         throw new Error("shopIds must be provided and must be a non-empty array");
//     }

//     let selector = {
//         ancestors: [],
//         isDeleted: { $ne: true },
//         shopId: { $in: shopIds }
//     };

//     // Apply the filters for product IDs, visibility, etc.
//     if (productIds) {
//         selector._id = { $in: productIds };
//     }

//     if (isVisible !== undefined) {
//         selector.isVisible = isVisible;
//     }

//     if (isArchived !== undefined) {
//         selector.isDeleted = isArchived;
//     }

//     if (storeName) {
//         selector.sellerId = storeName;
//     }

//     if (startDate && endDate) {
//         selector.createdAt = { $gte: new Date(startDate), $lte: new Date(endDate) };
//     }

//     if (tagIds && tagIds.length > 0) {
//         selector.hashtags = { $in: tagIds };
//     }

//     if (query) {
//         const cond = { $regex: query, $options: "i" };
//         selector.$or = [
//             { title: cond },
//             { pageTitle: cond },
//             { description: cond },
//             { referenceId: cond }
//         ];
//     }

//     console.log("SELECTOR: " + JSON.stringify(selector, null, 2));




//     const options = {
//         limit: first,
//         sort: { createdAt: -1 }
//     };

//     const products = await Products.find(selector, options).toArray();
//     const totalCount = await Products.countDocuments(selector);

//     // Pagination logic
//     const edges = products.map(product => ({ node: product }));
//     const pageInfo = {
//         endCursor: edges.length > 0 ? edges[edges.length - 1].node._id : null,
//         hasNextPage: edges.length === first
//     };

//     return {
//         totalCount,
//         pageInfo,
//         edges,
//         nodes: products
//     };
// }
