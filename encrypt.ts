

import * as CryptoJS from "crypto-js";

export class Encrypt{
    static key:string;

    private static wordArrayToArrayBuffer(wordArray: CryptoJS.lib.WordArray) {
        const { words, sigBytes } = wordArray;
        const buf = new ArrayBuffer(sigBytes);
        const view = new Uint8Array(buf);

        for (let i = 0; i < sigBytes; i++) {
            view[i] = (words[i >>> 2] >>> (24 - (i % 4) * 8)) & 0xff;
        }
        return buf;
    }

    // Encryption 加密
    static encryptText(buffer: ArrayBuffer, key: string): ArrayBuffer {
        try {
            const encrypted = CryptoJS.AES.encrypt(
                CryptoJS.lib.WordArray.create(new Uint8Array(buffer.slice(0))),
                CryptoJS.lib.WordArray.create(
                    new Uint8Array(new TextEncoder().encode(key.slice(16, 48)))
                ),
                {
                    iv: CryptoJS.enc.Utf8.parse(
                        new TextDecoder().decode(new TextEncoder().encode(key.slice(0, 16)))
                    ),
                    // formatter: CryptoJS.format.OpenSSL,
                    mode: CryptoJS.mode.CBC,
                    // padding: CryptoJS.pad.Pkcs7
                }
            );

            return this.wordArrayToArrayBuffer(encrypted.ciphertext);
        } catch (error) {
            throw new Error("加密失败: " + error.message);
        }
    }

    // Encryption 解密
    static decryptText(buffer: ArrayBuffer, key: string): ArrayBuffer {
        try {
            const content = CryptoJS.lib.CipherParams.create({
                ciphertext: CryptoJS.lib.WordArray.create(
                    new Uint8Array(buffer.slice(0))
                ),
            });

            const bytes = CryptoJS.AES.decrypt(
                content,
                CryptoJS.lib.WordArray.create(
                    new Uint8Array(new TextEncoder().encode(key.slice(16, 48)))
                ),
                {
                    iv: CryptoJS.enc.Utf8.parse(
                        new TextDecoder().decode(
                        new TextEncoder().encode(key.slice(0, 16)))
                    ),
                    // formatter: CryptoJS.format.OpenSSL,
                    mode: CryptoJS.mode.CBC,
                    // padding: CryptoJS.pad.Pkcs7
                }
            );

            const decrypted = this.wordArrayToArrayBuffer(bytes); // bytes.toString(CryptoJS.enc.Utf8);
            if (!decrypted) {
                throw new Error("解密失败，请检查密钥是否正确");
            }
            return decrypted;
        } catch (error) {
            throw new Error("解密失败: " + error.message);
        }
    }
    
}