import { decodeProductOpaqueId, decodeShopOpaqueId, decodeTagOpaqueId } from "../xforms/id.js";

// export default async function productsOptimize(context, {
//     first = 10, // The number of items to return
//     offset = 0, // The offset to start returning items from
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

//     // Decoding IDs
//     const tagIds = opaqueTagIds ? opaqueTagIds.map(decodeTagOpaqueId) : [];
//     const shopIds = opaqueShopIds ? opaqueShopIds.map(decodeShopOpaqueId) : [];
//     const productIds = opaqueProductIds ? opaqueProductIds.map(decodeProductOpaqueId) : [];

//     // Ensure shopIds are provided and are an array
//     if (!shopIds.length) {
//         throw new Error("shopIds must be provided and must be a non-empty array");
//     }

//     let selector = {
//         ancestors: [],
//         isDeleted: { $ne: true },
//         shopId: { $in: shopIds }
//     };

//     console.log("SELECTOR ON THE TOP", selector)

//     if (productIds.length) {
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

//     if (tagIds.length) {
//         console.log("SELECTOR HASHTAGS", selector)
//         console.log("TAG IS INSIDE THE IF", tagIds)
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
//         skip: offset, // MongoDB uses 'skip' for offset
//         sort: { createdAt: -1 }
//     };

//     const initialProducts = await Products.find(selector, options).toArray();

//     console.log("INITIAL PRODUCTS", initialProducts);
//     const totalCount = await Products.countDocuments(selector);

//     if (isSoldOut !== undefined) {
//         const productIds = initialProducts.map(product => product._id);
//         const catalogEntries = await Catalog.find({
//             "product._id": { $in: productIds },
//             "product.isSoldOut": isSoldOut
//         }, { projection: { "product._id": 1 } }).toArray();

//         const soldOutProductIds = new Set(catalogEntries.map(entry => entry.product._id.toString()));
//         const filteredProducts = initialProducts.filter(product => soldOutProductIds.has(product._id.toString()));

//         return {
//             totalCount: filteredProducts.length, // Total count of filtered results
//             pageInfo: {
//                 endCursor: filteredProducts.length ? filteredProducts[filteredProducts.length - 1]._id : null,
//                 hasNextPage: filteredProducts.length === first
//             },
//             edges: filteredProducts.map(product => ({ node: product })),
//             nodes: filteredProducts
//         };
//     } else {
//         return {
//             totalCount,
//             pageInfo: {
//                 endCursor: initialProducts.length ? initialProducts[initialProducts.length - 1]._id : null,
//                 hasNextPage: initialProducts.length === first
//             },
//             edges: initialProducts.map(product => ({ node: product })),
//             nodes: initialProducts
//         };
//     }
// }


export default async function productsOptimize(context, {
    first = 10, // The number of items to return
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
        isDeleted: isArchived !== undefined ? isArchived : { $ne: true },
        shopId: { $in: shopIds }
    };

    if (productIds.length) {
        selector._id = { $in: productIds };
    }

    if (isVisible !== undefined) {
        selector.isVisible = isVisible;
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

    let pipeline = [{ $match: selector }];

    if (query) {
        pipeline.push({
            $match: {
                $or: [
                    { title: { $regex: query, $options: "i" } },
                    { pageTitle: { $regex: query, $options: "i" } },
                    { description: { $regex: query, $options: "i" } },
                    { referenceId: { $regex: query, $options: "i" } }
                ]
            }
        });
    }

    // Integrate Catalog data if checking for sold out status
    if (isSoldOut !== undefined) {
        pipeline.push({
            $lookup: {
                from: "Catalog",
                localField: "_id",
                foreignField: "product._id",
                as: "catalogInfo"
            }
        },
            {
                $unwind: {
                    path: "$catalogInfo",
                    preserveNullAndEmptyArrays: false
                }
            },
            {
                $match: { "catalogInfo.product.isSoldOut": isSoldOut }
            });
    }

    // Count filtered results before pagination
    const countPipeline = [...pipeline, { $count: "total" }];
    const countResults = await Products.aggregate(countPipeline).toArray();
    const totalCount = countResults.length > 0 ? countResults[0].total : 0;

    // Apply sorting, skipping, and limiting
    pipeline.push({ $sort: { createdAt: -1 } });
    pipeline.push({ $skip: offset });
    pipeline.push({ $limit: first });

    const products = await Products.aggregate(pipeline).toArray();

    // Prepare the response with detailed pagination info
    return {
        totalCount,
        pageInfo: {
            endCursor: products.length ? products[products.length - 1]._id : null,
            hasNextPage: products.length === first
        },
        edges: products.map(product => ({ node: product })),
        nodes: products
    };
}