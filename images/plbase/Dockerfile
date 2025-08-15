FROM amazonlinux:2023
ARG CACHEBUST=2025-08-15-14-12-22

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
