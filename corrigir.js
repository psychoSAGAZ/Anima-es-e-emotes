const https = require("https");
const fs = require("fs");

const arquivos = ["AnimationSniper.json", "AnimationSniperoffsale.json"];

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function fetchPostData(url, body) {
    return new Promise((resolve, reject) => {
        const parsedUrl = new URL(url);
        const options = {
            method: "POST",
            hostname: parsedUrl.hostname,
            path: parsedUrl.pathname + parsedUrl.search,
            headers: {
                "Content-Type": "application/json",
                "Accept": "application/json"
            }
        };

        const req = https.request(options, (res) => {
            let data = "";
            if (res.statusCode !== 200) {
                reject(new Error(`HTTP ${res.statusCode}`));
                return;
            }
            res.on("data", (chunk) => data += chunk);
            res.on("end", () => {
                try { resolve(JSON.parse(data)); } 
                catch (e) { reject(e); }
            });
        });

        req.on("error", reject);
        req.write(JSON.stringify(body));
        req.end();
    });
}

async function corrigirArquivos() {
    log("Iniciando varredura precisa com nomes de animações (Idle, Walk, Run...)");

    for (const arquivo of arquivos) {
        if (!fs.existsSync(arquivo)) {
            log(`Arquivo ${arquivo} não encontrado, pulando...`);
            continue;
        }

        log(`Analisando ${arquivo}...`);
        const fileData = JSON.parse(fs.readFileSync(arquivo, "utf8"));
        const itens = fileData.data || [];
        let corrigidos = 0;

        // Filtra apenas os itens que estão com o bundledItems incompleto ou vazio
        const itensParaCorrigir = itens.filter(item => !item.bundledItems || Array.isArray(item.bundledItems) || Object.keys(item.bundledItems).length === 0);

        if (itensParaCorrigir.length === 0) {
            log(`Nada para corrigir em ${arquivo}.`);
            continue;
        }

        // Faz a checagem em lotes para ser rápido e eficiente
        const itemIds = itensParaCorrigir.map(item => ({ itemType: "Asset", id: item.id }));
        
        try {
            log(`Enviando ${itemIds.length} itens para checagem detalhada no Roblox...`);
            const response = await fetchPostData("https://catalog.roproxy.com/v1/catalog/items/details", { items: itemIds });

            if (response && Array.isArray(response.data)) {
                response.data.forEach(pacoteOriginal => {
                    if (pacoteOriginal && pacoteOriginal.bundledItems && Array.isArray(pacoteOriginal.bundledItems)) {
                        const bundledAssets = {};

                        pacoteOriginal.bundledItems.forEach(bundledItem => {
                            if (bundledItem.type === "UserOutfit" || bundledItem.type === "Outfit") return;

                            let animType = bundledItem.name || bundledItem.assetType || "Unknown";
                            animType = animType.toLowerCase();

                            if (animType.includes("inatividade") || animType.includes("idle")) animType = "Idle";
                            else if (animType.includes("corrida") || animType.includes("run")) animType = "Run";
                            else if (animType.includes("andar") || animType.includes("walk")) animType = "Walk";
                            else if (animType.includes("pulo") || animType.includes("jump")) animType = "Jump";
                            else if (animType.includes("queda") || animType.includes("fall")) animType = "Fall";
                            else if (animType.includes("nado") || animType.includes("swim")) animType = "Swim";
                            else if (animType.includes("escalada") || animType.includes("climb")) animType = "Climb";
                            else if (animType.includes("pose")) animType = "Pose";
                            else return;

                            if (bundledItem.id) {
                                // Salva apenas o primeiro ID direto (formato limpo número)
                                if (!bundledAssets[animType]) {
                                    bundledAssets[animType] = bundledItem.id;
                                }
                            }
                        });

                        if (Object.keys(bundledAssets).length > 0) {
                            // Encontra o item correspondente na nossa lista local e atualiza
                            const itemLocal = itens.find(i => i.id === pacoteOriginal.id);
                            if (itemLocal) {
                                itemLocal.bundledItems = bundledAssets;
                                corrigidos++;
                                log(`   -> [Corrigido] ${itemLocal.name} agora possui: ${Object.keys(bundledAssets).join(", ")}`);
                            }
                        }
                    }
                });
            }
        } catch (error) {
            log(`Erro durante a chamada em lote: ${error.message}`);
        }

        if (corrigidos > 0) {
            fileData.lastUpdate = new Date().toISOString();
            fs.writeFileSync(arquivo, JSON.stringify(fileData, null, 2), "utf8");
            log(`Sucesso! ${corrigidos} itens foram salvos com as animações identificadas em ${arquivo}.`);
        } else {
            log(`Nenhum item alterado em ${arquivo}.`);
        }
    }
    log("Correção concluída!");
}

corrigirArquivos();
