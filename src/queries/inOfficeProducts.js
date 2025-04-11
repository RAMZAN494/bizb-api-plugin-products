import { decodeProductOpaqueId, decodeShopOpaqueId, decodeTagOpaqueId } from "../xforms/id.js";

export default async function inOfficeProducts(context, {
    first = 10, // The number of items to return
    offset = 0, // The offset to start returning items from
    shopIds: opaqueShopIds,
    productIds: opaqueProductIds,
    tagIds: opaqueTagIds,
    query,
    isArchived,
    isVisible,
    storeName,
    arrivalDate,
    storyPostingDate,
    isSoldOut // New filter parameter
}) {
    const { collections } = context;
    const { Products, Catalog } = collections;

    // Decoding IDs
    const tagIds = opaqueTagIds ? opaqueTagIds.map(decodeTagOpaqueId) : [];
    const shopIds = opaqueShopIds ? opaqueShopIds.map(decodeShopOpaqueId) : [];
    const productIds = opaqueProductIds ? opaqueProductIds.map(decodeProductOpaqueId) : [];


    console.log("Arrival Date:", arrivalDate);
    console.log("STORY POSTIN DATE:", storyPostingDate);

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

    if (tagIds.length) {
        selector.hashtags = { $in: tagIds };
    }

    if (arrivalDate) {
        selector.arrivalDate = {
            $eq: new Date(arrivalDate)
        };
    }

    if (storyPostingDate) {
        selector.storyPostingDate = {
            $eq: new Date(storyPostingDate)
        };
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