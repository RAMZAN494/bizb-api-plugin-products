export default async function inOfficeProducts(parent, args, context, info) {
    if (!context.queries.inOfficeProducts) {
        throw new Error("GetAllCategories function is not defined in queries.");
    }

    let getProducts = await context.queries.inOfficeProducts(context, args);
    return getProducts;
}
