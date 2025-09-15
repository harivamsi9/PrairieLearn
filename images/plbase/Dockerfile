FROM amazonlinux:2023
ARG CACHEBUST=2025-09-15-14-12-46

COPY plbase-install.sh python-requirements.txt /

RUN /bin/bash /plbase-install.sh

CMD [ "/bin/bash" ]
