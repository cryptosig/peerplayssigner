import Vue from 'vue';
import Router from 'vue-router';
import { hasAccounts } from '@/helpers/keychain';

const Home = () => import(/* webpackChunkName: "home" */ '@/views/Home.vue');
const Import = () => import(/* webpackChunkName: "import" */ '@/views/Import.vue');
const Login = () => import(/* webpackChunkName: "login" */ '@/views/Login.vue');
const Accounts = () => import(/* webpackChunkName: "accounts" */ '@/views/Accounts.vue');
const Settings = () => import(/* webpackChunkName: "settings" */ '@/views/Settings.vue');
const Sign = () => import(/* webpackChunkName: "sign" */ '@/views/Sign.vue');
const Error404 = () => import(/* webpachChunkName: "error-404" */ '@/views/404.vue');

Vue.use(Router);

const beforeLogin = (to, from, next) => {
  if (!hasAccounts()) {
    const redirect = to.query.redirect === '/' ? undefined : to.query.redirect;
    const authority = to.query.authority || undefined;
    next({ name: 'import', query: { redirect, authority } });
  } else {
    next();
  }
};

export default new Router({
  scrollBehavior() {
    return { x: 0, y: 0 };
  },
  routes: [
    {
      path: '/',
      name: 'home',
      beforeEnter: null,
      component: Home,
    },
    {
      path: '/import',
      name: 'import',
      component: Import,
    },
    {
      path: '/login',
      name: 'login',
      beforeEnter: beforeLogin,
      component: Login,
    },
    {
      path: '/settings',
      name: 'settings',
      component: Settings,
    },
    {
      path: '/sign/*',
      name: 'sign',
      component: Sign,
    },
    {
      path: '/accounts',
      name: 'accounts',
      component: Accounts,
    },
    {
      path: '*',
      component: Error404,
      name: 'error-404',
    },
  ],
  mode: 'history',
});
