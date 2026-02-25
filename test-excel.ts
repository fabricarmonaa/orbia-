import { buildPreview } from "./server/services/excel-import";
console.log("Testing excel import buildPreview");
try {
    const result = buildPreview("purchases", "./dummy.xlsx");
    console.log("Success:", result);
} catch (e) {
    console.error("Error detected:");
    console.error(e);
}
