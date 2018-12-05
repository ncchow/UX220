/**
 * @file route
 * @author Cuttle Cong
 * @date 2018/2/27
 * @description
 */
const nps = require('path')
const join = require('url-join')
const { createReadStream: streamifier } = require('streamifier')
const qs = require('qs')
const { h } = require('react-mobx-vm')
const ReactDOMServer = require('react-dom/server.node')
const React = require('react')
const { Router } = require('express')
const express = require('express')

require('./registerRequire')
const port = require('./port')
const headless = require('./headless')
const parse = require('../core/utils/parseQuerystring').default
const AppVM = require('../client/ViewModel/App').default
const Telescope = require('../core/index').default

const r = new Router
const specRouter = new Router

async function handle(query, req, res, next) {
  // '/pdf' | '/img'
  const {
    style,
    hlStyle,
    q,
    range,
    print,
    ...options
  } = query

  if (options.hasOwnProperty('_force')) {
    options.force = options._force !== false
    delete options._force
  }

  const baseUrl = req.baseUrl
  let path
  switch (baseUrl) {
    case '/pdf':
      path = await headless.pdf(
        join(`http://localhost:${port}/`, '?' + qs.stringify({ style, q, hlStyle, range })),
        options
      )
      res.type('pdf')
      res.sendFile(path)
      return
    case '/img':
      path = await headless.img(
        join(`http://localhost:${port}/`, '?' + qs.stringify({ style, q, hlStyle, range, print: true })),
        options
      )
      res.type('image/png')
      res.sendFile(path)
      // .send(buffer)
      return
  }


  const appVM = AppVM.create({ input: query.q, inputVisible: false, styleSelectVisible: false })
  const telescope = appVM.telescope = new Telescope(query)
  await appVM.explore()

  const stream = ReactDOMServer.renderToStaticNodeStream(h(appVM))
  const hlMarkup = telescope.options.hlStyle
    ? `<link rel="stylesheet" href="${join('/', req.baseUrl, 'hl')}/${telescope.options.hlStyle.replace(/\s/g, '-')}.css" />`
    : ''
  res.type('html')
  res.write(
    `<html>
<head>
<meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title> 🔭 Telescope </title>
<link rel="stylesheet" href="${join('/', req.baseUrl, 'style')}/${telescope.options.style.replace(/\s/g, '-')}.css" />
${hlMarkup}
<link rel="stylesheet" href="${join('/', req.baseUrl, 'style.css')}" />    
<!--<link rel="stylesheet" href="${join('/', req.baseUrl, 'print.css')}" media="print"/>-->    
${query.print ? `<link rel="stylesheet" href="${join('/', req.baseUrl, 'print.css')}" />` : ''}
</head>
<body>`)

  stream
    .on('end', () => {
      res.end(`</body></html>`)
    })
    .pipe(res, { end: false })
}

async function handleExact(req, res, next) {
  const { branch, name, owner, 0: filepath } = req.params
  const query = req.url.indexOf('?') >= 0 ? parse(req.url) : {}
  query.q = `https://github.com/${owner}/${name}/${branch || 'master'}/${filepath || ''}`

  await handle(query, req, res, next)
}

specRouter.all('/', async function (req, res, next) {
  const query = req.url.indexOf('?') >= 0 ? parse(req.url) : {}
  try {
  await handle(query, req, res, next)
  } catch (err) {
    next(err)
  }
})
specRouter.all('/style.css', function (req, res) {
  res.sendFile(require.resolve('../client/index.css'), {
    headers: {
      'Content-Type': 'text/css; charset=utf-8'
    }
  })
})
specRouter.all('/print.css', function (req, res) {
  res.sendFile(require.resolve('./print.css'), {
    headers: {
      'Content-Type': 'text/css; charset=utf-8'
    }
  })
})
specRouter.all('/style/:style.css', (req, res, next) => {
  const { style } = req.params
  // Telescope.styleGetter[style] exports filename in nodejs.
  res.sendFile(Telescope.styleGetter[style], {
    headers: {
      'Content-Type': 'text/css; charset=utf-8'
    }
  })
})
specRouter.use(
  '/hl',
  express.static(
    nps.join(require.resolve('highlight.js/styles/school-book.png'), '..')
  )
)
specRouter.all('/hl/:style.css', (req, res, next) => {
  const { style } = req.params
  // Telescope.styleGetter[style] exports filename in nodejs.
  res.sendFile(Telescope.hlStyleGetter[style], {
    headers: {
      'Content-Type': 'text/css; charset=utf-8'
    }
  })
})

async function catchError(req, res, next) {
  try {
    await handleExact(req, res, next)
  } catch (error) {
    next(error)
  }
}

specRouter.all('/:owner/:name/:branch/**', catchError)
specRouter.all('/:owner/:name/:branch?', catchError)
specRouter.all('/:owner/:name', catchError)

r.use('/:type(img|pdf)', specRouter)
r.use('/', specRouter)

module.exports = r
