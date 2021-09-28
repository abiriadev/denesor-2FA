const express = require('express')
const axios = require('axios')
const qs = require('querystring')
const url = require('url')
const path = require('path')

const {
    CLIENT_ID: client_id,
    CLIENT_SECRET: client_secret,
    REDIRECT_URI: redirect_uri,
    DISCORD_API_VERSION,
    MFA_ROLE_ID,
    API_HOST,
    API_ENDPOINT,
    OAUTH_PATH,
    USERS_ME_PATH,
    BOT_TOKEN,
    TARGET_GUILD_ID,
} = process.env

const discordAPIURIGenerator = (pathname = '') =>
    url.format({
        protocol: 'https:',
        slashes: true,
        host: API_HOST,
        pathname: path.posix.join(
            API_ENDPOINT,
            `v${DISCORD_API_VERSION}`,
            pathname,
        ),
    })

const getToken = async ({ grant_type, code }) =>
    (
        await axios({
            method: 'post',
            url: discordAPIURIGenerator(OAUTH_PATH),
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
            data: qs.stringify({
                grant_type,
                client_id,
                client_secret,
                redirect_uri,
                code,
            }),
        })
    ).data

const oauth = async code => {
    try {
        let { access_token, token_type } = await getToken({
            grant_type: 'authorization_code',
            code,
        })

        console.log(`access_token: ${access_token}`)

        const { mfa_enabled, id } = (
            await axios({
                method: 'get',
                url: discordAPIURIGenerator(USERS_ME_PATH),
                headers: {
                    Authorization: `${token_type} ${access_token}`,
                },
            })
        ).data

        if (mfa_enabled) {
            const { data } = await axios({
                method: 'put',
                url: discordAPIURIGenerator(
                    path.posix.join(
                        'guilds',
                        TARGET_GUILD_ID,
                        'members',
                        id,
                        'roles',
                        MFA_ROLE_ID,
                    ),
                ),
                headers: {
                    Authorization: `Bot ${BOT_TOKEN}`,
                    'X-Audit-Log-Reason': 'gave 2FA role',
                },
            })

            return {
                code: 200,
                response: {
                    message:
                        'successfully checked you are 2FA authenticated!\n' +
                        'you got some new role! check it out! :)',
                },
            }
        } else {
            return {
                code: 400,
                response: {
                    message: 'you have to enable 2FA authorization first',
                },
            }
        }
    } catch (e) {
        console.error(e)

        return {
            code: 503,
            response: {
                message: 'it had some error :(',
            },
        }
    }
}

express()
    .all('/', async (req, res) => {
        const { code } = req.query

        if (!code)
            return res.status(400).send({
                code: 400,
                message: 'bad request, you must pass OAuth code',
            })

        console.log(`code: ${code}`)

        const { code: stateCode, response } = await oauth(code)

        res.status(stateCode).send({ code: stateCode, ...response })
    })
    .all('*', (req, res) => res.status(404).send('404 NOT FOUND :('))
    .listen(process.env.PORT)
