const https = require("https");
const fs = require("fs");

const arquivos = ["AnimationSniper.json", "AnimationSniperoffsale.json"];

function log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
}

async function fetchData(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
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
        }).on("error", reject);
    });
}

// Retorna o tipo exato baseado no AssetTypeId oficial do Roblox
async function getExactAnimType(assetId) {
    try {
        await new Promise(r => setTimeout(r, 300)); 
        const data = await fetchData(`https://economy.roproxy.com/v2/assets/${assetId}/details`);
        if (data && data.AssetTypeId) {
            switch(data.AssetTypeId) {
                case 48: return "Climb";
                case 50: return "Fall";
                case 51: return "Idle";
                case 52: return "Jump";
                case 53: return "Run";
                case 54: return "Swim";
                case 55: return "Walk";
                case 56: return "Pose";
                default: return null;
            }
        }
    } catch (e) {
        // Ignora erros individuais de assets de roupa ou corpo
    }
    return null;
}

// Nova função usando a API de Marketplace do Roblox (Suporta Packages e Bundles antigos)
async function getItemsFromProductInfo(assetId) {
    try {
        // Usando o roproxy para acessar as informações de produto do marketplace do roblox
        const data = await fetchData(`https://catalog.roproxy.com/v1/catalog/items/${assetId}/details?itemType=Asset`);
        if (data && Array.isArray(data.bundledItems)) {
            return data.bundledItems.map(i => i.id);
        }
    } catch (e) {
        // Fallback para a rota alternativa de bundles caso o item seja um bundle puro
        try {
            const data = await fetchData(`https://catalog.roproxy.com/v1/bundles/${assetId}/details`);
            if (data && Array.isArray(data.items)) {
                return data.items.map(i => i.id);
            }
        } catch (err) {
            // Se falhar em ambos, tenta a rota de informações gerais do asset
            try {
                const data = await fetchData(`https://economy.roproxy.com/v2/assets/${assetId}/details`);
                // Se o próprio item for uma animação direta (não um pacote), retorna ele mesmo
                if (data && data.AssetTypeId && data.AssetTypeId >= 48 && data.AssetTypeId <= 56) {
                    return [assetId];
                }
            } catch (x) {}
        }
    }
    return null;
}

async function corrigirArquivos() {
    log("Iniciando varredura com API de Marketplace...");

    for (const arquivo of arquivos) {
        if (!fs.existsSync(arquivo)) {
            log(`Arquivo ${arquivo} não encontrado, pulando...`);
            continue;
        }

        log(`Analisando arquivo: ${arquivo}...`);
        const fileData = JSON.parse(fs.readFileSync(arquivo, "utf8"));
        const itens = fileData.data || [];
        let corrigidos = 0;

        for (const item of itens) {
            // Força a correção se bundledItems não existir, for array, ou estiver completamente vazio {}
            if (!item.bundledItems || Array.isArray(item.bundledItems) || Object.keys(item.bundledItems).length === 0) {
                log(`Processando item incompleto: ${item.name} (ID: ${item.id})`);
                
                try {
                    const subItemIds = await getItemsFromProductInfo(item.id);
                    
                    if (subItemIds && subItemIds.length > 0) {
                        const novosBundledItems = {};

                        for (const subId of subItemIds) {
                            if (subId) {
                                const exactType = await getExactAnimType(subId);
                                if (exactType && !novosBundledItems[exactType]) {
                                    novosBundledItems[exactType] = subId;
                                    log(`   -> [Sucesso] Identificado ${exactType}: ID ${subId}`);
                                }
                            }
                        }

                        if (Object.keys(novosBundledItems).length > 0) {
                            item.bundledItems = novosBundledItems;
                            corrigidos++;
                        } else {
                            log(`   -> [Aviso] O pacote não contém nenhuma animação mapeada.`);
                            // Evita loops infinitos nas próximas execuções marcando como tratado caso seja apenas um pacote de roupas/corpo
                            item.bundledItems = { "Status": "Verificado (Sem Animações)" };
                        }
                    } else {
                        log(`   -> [Falha] Roblox não retornou itens vinculados para o ID ${item.id}`);
                    }
                } catch (error) {
                    log(`   -> Erro ao processar: ${error.message}`);
                }
                
                // Espera 1.5 segundos para evitar limites de taxa (rate limits) da API
                await new Promise(r => setTimeout(r, 1500));
            }
        }

        if (corrigidos > 0) {
            fileData.lastUpdate = new Date().toISOString();
            // Filtra os marcadores de verificação vazios antes de salvar para manter o JSON limpo
            fileData.data = itens.map(item => {
                if (item.bundledItems && item.bundledItems.Status === "Verificado (Sem Animações)") {
                    delete item.bundledItems;
                }
                return item;
            });
            
            fs.writeFileSync(arquivo, JSON.stringify(fileData, null, 2), "utf8");
            log(`Concluído! ${corrigidos} itens modificados e salvos em ${arquivo}.`);
        } else {
            log(`Nenhum item alterado em ${arquivo}.`);
        }
    }
    log("Varredura de correção terminada!");
}

corrigirArquivos();
