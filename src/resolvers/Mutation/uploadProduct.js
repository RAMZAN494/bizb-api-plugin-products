import { decodeShopOpaqueId, decodeTagOpaqueId } from "../../xforms/id.js";


export default async function uploadProduct(_, { input }, context) {

    console.log("HIT THE UPLOAD PRODUCT MUTATION")

    const {
        clientMutationId = null,
        product: productInput,
        shopId,
        shouldCreateFirstVariant
    } = input;

    if (productInput && Array.isArray(productInput.tagIds)) {
        productInput.hashtags = productInput.tagIds.map(decodeTagOpaqueId);
        delete productInput.tagIds;
    }


    const product = await context.mutations.uploadProduct(context, {
        product: productInput,
        shopId: decodeShopOpaqueId(shopId),
        shouldCreateFirstVariant
    });

    return {
        clientMutationId,
        product
    };
}